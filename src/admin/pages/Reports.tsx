import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useAuth } from "../auth";
import { date, label, nameOf, q, supabase, today, useLoad, useLookups, type Lookups, type Row } from "../lib";
import { exportCsv, exportPdf, exportXlsx, type ExportColumn } from "../export";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner } from "../ui";

interface Ctx { from: string; to: string; variant: string; l: Lookups }
interface Report {
  key: string;
  group: "Properties" | "CRM" | "Contracts" | "Payments";
  title: string;
  perms: string[];
  dated?: string;               // label for the date range, if the report uses it
  variants?: { key: string; label: string }[];
  load: (c: Ctx) => Promise<Row[]>;
  columns: (c: Ctx) => ExportColumn[];
}

const end = (d: string) => `${d}T23:59:59.999`;
const num = (v: unknown) => Number(v ?? 0);
const fmt = (v: unknown) => (v == null || v === "" ? "" : num(v).toLocaleString("en-PK", { maximumFractionDigits: 2 }));
const staffName = (l: Lookups, id: unknown) => (id ? nameOf(l.staff, id, "id", "full_name") : "Unassigned");

function groupBy(rows: Row[], key: (r: Row) => string, extra?: (group: Row[]) => Row) {
  const map = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = key(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  });
  return [...map.entries()].map(([k, g]) => ({ group: k, count: g.length, ...(extra?.(g) ?? {}) })).sort((a, b) => b.count - a.count);
}

const leadsQuery = (c: Ctx) => q<Row[]>(supabase.from("leads")
  .select("id, ref, name, mobile, inquiry_type, status_id, source_id, assigned_to, priority, lost_reason, next_follow_up_at, created_at, converted_at, properties(ref)")
  .gte("created_at", c.from).lte("created_at", end(c.to)).order("created_at", { ascending: false }).limit(5000));

const REPORTS: Report[] = [
  // ---------------- Properties (BRD §12.2)
  {
    key: "properties", group: "Properties", title: "Property inventory", perms: ["properties.view"],
    variants: [
      { key: "all", label: "Complete inventory" }, { key: "available", label: "Available" }, { key: "sale", label: "For sale (published)" },
      { key: "rent", label: "For rent (published)" }, { key: "sold", label: "Sold" }, { key: "rented", label: "Rented" }, { key: "archived", label: "Archived" },
    ],
    load: async ({ variant }) => {
      let query = supabase.from("properties").select("ref, title, category_id, type_id, listing_type, price, currency, city, area, size, size_unit, availability, publication, agent_id, created_at, updated_at").order("ref");
      if (variant === "available") query = query.eq("availability", "available").neq("publication", "archived");
      if (variant === "sale" || variant === "rent") query = query.eq("listing_type", variant).eq("publication", "published");
      if (variant === "sold" || variant === "rented") query = query.eq("availability", variant);
      if (variant === "archived") query = query.eq("publication", "archived");
      return q<Row[]>(query.limit(10000));
    },
    columns: ({ l }) => [
      { key: "ref", header: "Ref" }, { key: "title", header: "Title" },
      { key: "category_id", header: "Category", value: (r) => nameOf(l.categories, r.category_id) },
      { key: "type_id", header: "Type", value: (r) => nameOf(l.types, r.type_id) },
      { key: "listing_type", header: "For" }, { key: "price", header: "Price", value: (r) => num(r.price) }, { key: "currency", header: "Currency" },
      { key: "city", header: "City" }, { key: "area", header: "Area" },
      { key: "size", header: "Size", value: (r) => `${r.size ?? ""} ${r.size_unit}` },
      { key: "availability", header: "Availability", value: (r) => label(r.availability as string) },
      { key: "publication", header: "Website", value: (r) => label(r.publication as string) },
      { key: "agent_id", header: "Agent", value: (r) => staffName(l, r.agent_id) },
      { key: "updated_at", header: "Last updated", value: (r) => date(r.updated_at as string) },
    ],
  },
  {
    key: "by-category", group: "Properties", title: "Properties by category", perms: ["properties.view"],
    load: async () => q<Row[]>(supabase.from("report_inventory").select("*").order("category")),
    columns: () => [
      { key: "category", header: "Category" }, { key: "listing_type", header: "For" },
      { key: "availability", header: "Availability", value: (r) => label(r.availability as string) },
      { key: "publication", header: "Website", value: (r) => label(r.publication as string) },
      { key: "properties", header: "Properties" }, { key: "total_price", header: "Total listed value", value: (r) => num(r.total_price) },
    ],
  },
  {
    key: "by-location", group: "Properties", title: "Properties by location", perms: ["properties.view"],
    load: async () => {
      const rows = await q<Row[]>(supabase.from("properties").select("city, area, listing_type, availability").neq("publication", "archived").limit(10000));
      return groupBy(rows, (r) => `${r.city} — ${r.area}`, (g) => ({
        for_sale: g.filter((r) => r.listing_type === "sale").length, for_rent: g.filter((r) => r.listing_type === "rent").length,
        available: g.filter((r) => r.availability === "available").length,
      }));
    },
    columns: () => [{ key: "group", header: "City — area" }, { key: "count", header: "Active properties" }, { key: "for_sale", header: "For sale" }, { key: "for_rent", header: "For rent" }, { key: "available", header: "Available" }],
  },
  {
    key: "stale", group: "Properties", title: "Properties without recent updates", perms: ["properties.view"], dated: "Not updated since",
    load: async ({ from }) => q<Row[]>(supabase.from("properties").select("ref, title, city, area, availability, publication, agent_id, updated_at")
      .lt("updated_at", from).neq("publication", "archived").order("updated_at").limit(5000)),
    columns: ({ l }) => [
      { key: "ref", header: "Ref" }, { key: "title", header: "Title" }, { key: "area", header: "Location", value: (r) => `${r.area}, ${r.city}` },
      { key: "availability", header: "Availability" }, { key: "publication", header: "Website" },
      { key: "agent_id", header: "Agent", value: (r) => staffName(l, r.agent_id) }, { key: "updated_at", header: "Last updated", value: (r) => date(r.updated_at as string) },
    ],
  },
  {
    key: "listing-history", group: "Properties", title: "Price and status history", perms: ["properties.view"], dated: "Changed between",
    load: async ({ from, to }) => q<Row[]>(supabase.from("property_history").select("field, old_value, new_value, changed_by, changed_at, properties(ref, title)")
      .gte("changed_at", from).lte("changed_at", end(to)).order("changed_at", { ascending: false }).limit(5000)),
    columns: ({ l }) => [
      { key: "changed_at", header: "When", value: (r) => date(r.changed_at as string) },
      { key: "property", header: "Property", value: (r) => `${(r.properties as Row)?.ref} ${(r.properties as Row)?.title}` },
      { key: "field", header: "Field", value: (r) => label(r.field as string) }, { key: "old_value", header: "From" }, { key: "new_value", header: "To" },
      { key: "changed_by", header: "Changed by", value: (r) => staffName(l, r.changed_by) },
    ],
  },

  // ---------------- CRM (BRD §12.3)
  {
    key: "leads", group: "CRM", title: "Leads", perms: ["leads.view_all", "leads.view_assigned"], dated: "Received between",
    variants: [
      { key: "all", label: "All leads" }, { key: "inquiry", label: "Property inquiries" }, { key: "viewing", label: "Viewing requests" },
      { key: "sell", label: "Sell Your Property submissions" }, { key: "unassigned", label: "Unassigned" },
      { key: "followup", label: "Awaiting follow-up" }, { key: "lost", label: "Lost leads and reasons" },
    ],
    load: async (c) => {
      const rows = await leadsQuery(c);
      const lost = c.l.leadStatuses.find((s) => s.slug === "lost")?.id;
      const closed = new Set(c.l.leadStatuses.filter((s) => s.is_closed).map((s) => s.id));
      return rows.filter((r) => {
        switch (c.variant) {
          case "inquiry": return ["buy", "rent", "general"].includes(r.inquiry_type) && r.properties;
          case "viewing": return r.inquiry_type === "viewing";
          case "sell": return r.inquiry_type === "sell";
          case "unassigned": return !r.assigned_to && !closed.has(r.status_id);
          case "followup": return !closed.has(r.status_id) && r.next_follow_up_at && new Date(r.next_follow_up_at) <= new Date();
          case "lost": return r.status_id === lost;
          default: return true;
        }
      });
    },
    columns: ({ l }) => [
      { key: "ref", header: "Ref" }, { key: "created_at", header: "Received", value: (r) => date(r.created_at as string) },
      { key: "name", header: "Name" }, { key: "mobile", header: "Mobile" }, { key: "inquiry_type", header: "Enquiry" },
      { key: "property", header: "Property", value: (r) => (r.properties as Row)?.ref },
      { key: "source_id", header: "Source", value: (r) => nameOf(l.sources, r.source_id) },
      { key: "status_id", header: "Status", value: (r) => nameOf(l.leadStatuses, r.status_id) },
      { key: "assigned_to", header: "Agent", value: (r) => staffName(l, r.assigned_to) },
      { key: "lost_reason", header: "Lost reason" },
      { key: "next_follow_up_at", header: "Next follow-up", value: (r) => date(r.next_follow_up_at as string) },
    ],
  },
  {
    key: "lead-summary", group: "CRM", title: "Leads by source, agent, status or date", perms: ["leads.view_all"], dated: "Received between",
    variants: [{ key: "source", label: "By source" }, { key: "agent", label: "By agent" }, { key: "status", label: "By status" }, { key: "date", label: "By date" }, { key: "type", label: "By enquiry type" }],
    load: async (c) => {
      const rows = await leadsQuery(c);
      const key = (r: Row) => c.variant === "agent" ? staffName(c.l, r.assigned_to)
        : c.variant === "status" ? nameOf(c.l.leadStatuses, r.status_id)
        : c.variant === "date" ? r.created_at.slice(0, 10)
        : c.variant === "type" ? r.inquiry_type
        : nameOf(c.l.sources, r.source_id);
      const g = groupBy(rows, key);
      return c.variant === "date" ? g.sort((a, b) => a.group.localeCompare(b.group)) : g;
    },
    columns: () => [{ key: "group", header: "Group" }, { key: "count", header: "Leads" }],
  },
  {
    key: "conversion", group: "CRM", title: "Lead conversion rate", perms: ["leads.view_all"], dated: "Received between",
    load: async (c) => {
      const rows = await leadsQuery(c);
      const won = new Set(c.l.leadStatuses.filter((s) => s.is_won).map((s) => s.id));
      const lost = new Set(c.l.leadStatuses.filter((s) => s.is_closed && !s.is_won).map((s) => s.id));
      const g = groupBy(rows, (r) => staffName(c.l, r.assigned_to), (grp) => {
        const w = grp.filter((r) => won.has(r.status_id)).length;
        return { won: w, lost: grp.filter((r) => lost.has(r.status_id)).length, open: grp.length - w - grp.filter((r) => lost.has(r.status_id)).length, rate: grp.length ? `${Math.round((w / grp.length) * 100)}%` : "0%" };
      });
      const totalWon = rows.filter((r) => won.has(r.status_id)).length;
      return [...g, { group: "All agents", count: rows.length, won: totalWon, lost: rows.filter((r) => lost.has(r.status_id)).length, open: "", rate: rows.length ? `${Math.round((totalWon / rows.length) * 100)}%` : "0%" }];
    },
    columns: () => [{ key: "group", header: "Agent" }, { key: "count", header: "Leads" }, { key: "won", header: "Won" }, { key: "lost", header: "Lost" }, { key: "open", header: "Open" }, { key: "rate", header: "Conversion rate" }],
  },
  {
    key: "pipeline", group: "CRM", title: "Sales pipeline (open leads by stage)", perms: ["leads.view_all", "leads.view_assigned"],
    load: async ({ l }) => {
      const rows = await q<Row[]>(supabase.from("leads").select("status_id, budget_max").in("status_id", l.leadStatuses.filter((s) => !s.is_closed).map((s) => s.id)).limit(10000));
      return l.leadStatuses.filter((s) => !s.is_closed).map((s) => {
        const g = rows.filter((r) => r.status_id === s.id);
        return { group: s.name, count: g.length, budget: g.reduce((a, r) => a + num(r.budget_max), 0) };
      });
    },
    columns: () => [{ key: "group", header: "Stage" }, { key: "count", header: "Leads" }, { key: "budget", header: "Total stated budget", value: (r) => num(r.budget) }],
  },
  {
    key: "overdue-followups", group: "CRM", title: "Overdue follow-up activities", perms: ["leads.view_all", "leads.view_assigned"],
    load: async () => q<Row[]>(supabase.from("activities").select("kind, subject, due_at, assigned_to, leads(ref, name), customers(ref, full_name)")
      .is("completed_at", null).lt("due_at", new Date().toISOString()).order("due_at").limit(5000)),
    columns: ({ l }) => [
      { key: "due_at", header: "Was due", value: (r) => date(r.due_at as string) }, { key: "kind", header: "Type" }, { key: "subject", header: "Task" },
      { key: "who", header: "Lead / customer", value: (r) => (r.leads as Row)?.name ?? (r.customers as Row)?.full_name },
      { key: "assigned_to", header: "Assigned to", value: (r) => staffName(l, r.assigned_to) },
    ],
  },
  {
    key: "agent-activity", group: "CRM", title: "Staff activity", perms: ["reports.view"],
    load: async () => q<Row[]>(supabase.from("report_agent_activity").select("*").order("full_name")),
    columns: () => [
      { key: "full_name", header: "Staff member" }, { key: "leads_assigned", header: "Leads assigned" }, { key: "leads_open", header: "Open" },
      { key: "leads_won", header: "Won" }, { key: "activities_30d", header: "Activities (30 days)" }, { key: "overdue_follow_ups", header: "Overdue follow-ups" },
    ],
  },

  // ---------------- Contracts (BRD §12.4)
  {
    key: "contracts", group: "Contracts", title: "Contracts", perms: ["contracts.view", "contracts.view_own"], dated: "Ending between (for 'Expiring')",
    variants: [
      { key: "active", label: "Active" }, { key: "expiring", label: "Expiring within selected period" }, { key: "renewal", label: "Due for renewal (next action)" },
      { key: "expired", label: "Expired" }, { key: "renewed", label: "Renewed" }, { key: "terminated", label: "Terminated" }, { key: "all", label: "All contracts" },
    ],
    load: async ({ variant, from, to }) => {
      let query = supabase.from("contracts").select("ref, type_id, status, renewal_status, start_date, end_date, next_action_date, rent_amount, value, currency, responsible_id, properties(ref, title), contract_parties(role, customers(full_name))").order("end_date");
      if (variant === "active") query = query.in("status", ["active", "expiring_soon"]);
      if (variant === "expiring") query = query.in("status", ["active", "expiring_soon"]).gte("end_date", from).lte("end_date", to);
      if (variant === "renewal") query = query.in("status", ["active", "expiring_soon", "expired"]).not("next_action_date", "is", null).lte("next_action_date", to);
      if (["expired", "renewed", "terminated"].includes(variant)) query = query.eq("status", variant);
      return q<Row[]>(query.limit(10000));
    },
    columns: ({ l }) => [
      { key: "ref", header: "Ref" }, { key: "type_id", header: "Type", value: (r) => nameOf(l.contractTypes, r.type_id) },
      { key: "property", header: "Property", value: (r) => `${(r.properties as Row)?.ref} ${(r.properties as Row)?.title}` },
      { key: "parties", header: "Parties", value: (r) => ((r.contract_parties as Row[]) ?? []).map((p) => `${p.customers?.full_name} (${p.role})`).join("; ") },
      { key: "start_date", header: "Start", value: (r) => date(r.start_date as string) }, { key: "end_date", header: "End", value: (r) => date(r.end_date as string) },
      { key: "status", header: "Status", value: (r) => label(r.status as string) }, { key: "renewal_status", header: "Renewal", value: (r) => label(r.renewal_status as string) },
      { key: "amount", header: "Rent / value", value: (r) => num(r.rent_amount ?? r.value) },
      { key: "responsible_id", header: "Responsible", value: (r) => staffName(l, r.responsible_id) },
    ],
  },
  {
    key: "contracts-by", group: "Contracts", title: "Contracts by customer, property or employee", perms: ["contracts.view"],
    variants: [{ key: "employee", label: "By responsible employee" }, { key: "property", label: "By property" }, { key: "customer", label: "By customer" }],
    load: async ({ variant, l }) => {
      if (variant === "customer") {
        const rows = await q<Row[]>(supabase.from("contract_parties").select("role, customers(ref, full_name), contracts(status)").limit(10000));
        return groupBy(rows, (r) => `${r.customers?.ref} ${r.customers?.full_name}`, (g) => ({ active: g.filter((r) => ["active", "expiring_soon"].includes(r.contracts?.status)).length }));
      }
      const rows = await q<Row[]>(supabase.from("contracts").select("status, responsible_id, properties(ref, title)").limit(10000));
      return groupBy(rows, (r) => variant === "property" ? `${r.properties?.ref} ${r.properties?.title}` : staffName(l, r.responsible_id),
        (g) => ({ active: g.filter((r) => ["active", "expiring_soon"].includes(r.status)).length }));
    },
    columns: () => [{ key: "group", header: "Group" }, { key: "count", header: "Contracts" }, { key: "active", header: "Active" }],
  },

  // ---------------- Payments (BRD §12.5)
  {
    key: "payments", group: "Payments", title: "Payments received", perms: ["payments.view"], dated: "Paid between",
    variants: [{ key: "list", label: "All payments" }, { key: "customer", label: "By customer" }, { key: "property", label: "By property" }, { key: "schedule", label: "By contract / transaction schedule" }, { key: "method", label: "By payment method" }],
    load: async ({ from, to, variant }) => {
      const rows = await q<Row[]>(supabase.from("payment_receipts").select("receipt_no, paid_on, amount, currency, method, reference_no, direction, customer_name, property_refs, schedule_refs, installments, voided_at, void_type, allocations")
        .gte("paid_on", from).lte("paid_on", to).order("paid_on").limit(10000));
      if (variant === "list") return rows;
      const valid = rows.filter((r) => !r.voided_at && r.direction === "incoming");
      if (variant === "customer" || variant === "method") {
        return groupBy(valid, (r) => variant === "method" ? label(r.method) : r.customer_name, (g) => ({ amount: g.reduce((a, r) => a + num(r.amount), 0) }));
      }
      // Property and schedule totals come from allocations, so a payment split across obligations is counted correctly.
      const parts = valid.flatMap((r) => (r.allocations ?? []).map((a: Row) => ({ ...a, key: variant === "property" ? `${a.property_ref} ${a.property_title}` : `${a.schedule_ref} (${a.contract_ref ?? a.transaction_ref ?? ""})` })));
      return groupBy(parts, (a) => a.key, (g) => ({ amount: g.reduce((s, a) => s + num(a.amount), 0) }));
    },
    columns: ({ variant }) => variant === "list" ? [
      { key: "paid_on", header: "Date", value: (r) => date(r.paid_on as string) }, { key: "receipt_no", header: "Receipt" },
      { key: "customer_name", header: "Customer" }, { key: "property_refs", header: "Property" }, { key: "schedule_refs", header: "Schedule" },
      { key: "installments", header: "Applied to" }, { key: "method", header: "Method", value: (r) => label(r.method as string) },
      { key: "reference_no", header: "Reference" }, { key: "direction", header: "Direction" },
      { key: "amount", header: "Amount", value: (r) => num(r.amount) },
      { key: "voided_at", header: "Status", value: (r) => (r.voided_at ? `Reversed (${label(r.void_type as string)})` : "Received") },
    ] : [{ key: "group", header: "Group" }, { key: "count", header: variant === "customer" || variant === "method" ? "Payments" : "Allocations" }, { key: "amount", header: "Amount", value: (r) => num(r.amount) }],
  },
  {
    key: "commissions", group: "Payments", title: "Commissions", perms: ["commissions.view"], dated: "Created between",
    variants: [
      { key: "list", label: "All commissions" }, { key: "agent", label: "By agent" }, { key: "status", label: "By status" },
      { key: "outstanding", label: "Unpaid (pending and approved)" },
    ],
    load: async ({ from, to, variant }) => {
      let query = supabase.from("report_commissions").select("*").neq("status", "cancelled").gte("created_at", from).lte("created_at", end(to)).order("created_at");
      if (variant === "outstanding") query = query.in("status", ["pending", "approved"]);
      const rows = await q<Row[]>(query.limit(10000));
      if (variant === "agent") {
        return groupBy(rows.filter((r) => r.kind === "agent"), (r) => r.agent ?? "—", (g) => ({
          amount: g.reduce((a, r) => a + num(r.amount), 0), paid: g.filter((r) => r.status === "paid").reduce((a, r) => a + num(r.amount), 0),
        }));
      }
      if (variant === "status") {
        return groupBy(rows, (r) => `${label(r.kind)} — ${label(r.status)}`, (g) => ({ amount: g.reduce((a, r) => a + num(r.amount), 0) }));
      }
      return rows;
    },
    columns: ({ variant }) => variant === "agent"
      ? [{ key: "group", header: "Agent" }, { key: "count", header: "Commissions" }, { key: "amount", header: "Total", value: (r) => num(r.amount) }, { key: "paid", header: "Paid", value: (r) => num(r.paid) }]
      : variant === "status"
        ? [{ key: "group", header: "Kind — status" }, { key: "count", header: "Commissions" }, { key: "amount", header: "Amount", value: (r) => num(r.amount) }]
        : [
            { key: "ref", header: "Ref" }, { key: "created_at", header: "Created", value: (r) => date(r.created_at as string) },
            { key: "kind", header: "Kind" }, { key: "description", header: "Description" },
            { key: "party", header: "Payer / payee", value: (r) => (r.kind === "brokerage" ? r.payer : r.agent ?? r.referrer) as string },
            { key: "deal", header: "Deal", value: (r) => (r.transaction_ref ?? r.contract_ref) as string },
            { key: "property_ref", header: "Property" }, { key: "amount", header: "Amount", value: (r) => num(r.amount) },
            { key: "status", header: "Status", value: (r) => label(r.status as string) },
            { key: "due_date", header: "Due", value: (r) => date(r.due_date as string) }, { key: "paid_on", header: "Paid", value: (r) => date(r.paid_on as string) },
          ],
  },
  {
    key: "collections", group: "Payments", title: "Collection summary", perms: ["payments.view"], dated: "Month between",
    load: async ({ from, to }) => q<Row[]>(supabase.from("report_collections").select("*").gte("month", from.slice(0, 8) + "01").lte("month", to).order("month")),
    columns: () => [
      { key: "month", header: "Month", value: (r) => (r.month as string).slice(0, 7) }, { key: "direction", header: "Direction" },
      { key: "method", header: "Method", value: (r) => label(r.method as string) }, { key: "payments", header: "Payments" },
      { key: "amount", header: "Amount", value: (r) => num(r.amount) }, { key: "currency", header: "Currency" },
    ],
  },
  {
    key: "installments", group: "Payments", title: "Installments and balances", perms: ["payments.view"],
    variants: [
      { key: "outstanding", label: "Outstanding balances (all unpaid)" }, { key: "overdue", label: "Overdue payments" }, { key: "upcoming", label: "Upcoming payments (next 30 days)" },
      { key: "partially_paid", label: "Partially paid obligations" }, { key: "all", label: "All installment schedules" },
    ],
    load: async ({ variant }) => {
      let query = supabase.from("installment_balances").select("*").order("due_date");
      if (variant === "outstanding") query = query.gt("outstanding", 0);
      if (variant === "overdue") query = query.eq("status", "overdue");
      if (variant === "partially_paid") query = query.gt("paid", 0).gt("outstanding", 0);
      if (variant === "upcoming") query = query.gt("outstanding", 0).gte("due_date", today()).lte("due_date", new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
      const rows = await q<Row[]>(query.limit(10000));
      const ids = [...new Set(rows.map((r) => r.customer_id))];
      const customers = ids.length ? await q<Row[]>(supabase.from("customers").select("id, full_name, mobile").in("id", ids)) : [];
      return rows.map((r) => ({ ...r, customer: customers.find((c) => c.id === r.customer_id)?.full_name, mobile: customers.find((c) => c.id === r.customer_id)?.mobile }));
    },
    columns: () => [
      { key: "due_date", header: "Due", value: (r) => date(r.due_date as string) }, { key: "customer", header: "Customer" }, { key: "mobile", header: "Mobile" },
      { key: "schedule_ref", header: "Schedule" }, { key: "description", header: "Installment" },
      { key: "amount", header: "Amount", value: (r) => num(r.amount) }, { key: "paid", header: "Paid", value: (r) => num(r.paid) },
      { key: "outstanding", header: "Outstanding", value: (r) => num(r.outstanding) },
      { key: "status", header: "Status", value: (r) => label(r.status as string) }, { key: "days_overdue", header: "Days overdue" },
    ],
  },
  {
    key: "schedules", group: "Payments", title: "Outstanding by schedule", perms: ["payments.view"],
    load: async () => {
      const rows = await q<Row[]>(supabase.from("schedule_balances").select("*").gt("outstanding", 0).order("next_due_date").limit(10000));
      const ids = [...new Set(rows.map((r) => r.customer_id))];
      const customers = ids.length ? await q<Row[]>(supabase.from("customers").select("id, full_name").in("id", ids)) : [];
      return rows.map((r) => ({ ...r, customer: customers.find((c) => c.id === r.customer_id)?.full_name })) as Row[];
    },
    columns: () => [
      { key: "ref", header: "Schedule" }, { key: "title", header: "Title" }, { key: "customer", header: "Customer" },
      { key: "payment_type", header: "Type", value: (r) => label(r.payment_type as string) }, { key: "direction", header: "Direction" },
      { key: "total", header: "Total", value: (r) => num(r.total) }, { key: "paid", header: "Paid", value: (r) => num(r.paid) },
      { key: "outstanding", header: "Outstanding", value: (r) => num(r.outstanding) }, { key: "overdue", header: "Overdue", value: (r) => num(r.overdue) },
      { key: "next_due_date", header: "Next due", value: (r) => date(r.next_due_date as string) }, { key: "status", header: "Status", value: (r) => label(r.status as string) },
    ],
  },
];

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const { can } = useAuth();
  const l = useLookups();
  const available = REPORTS.filter((r) => r.perms.some(can));
  const [key, setKey] = useState(available[0]?.key ?? "");
  const report = available.find((r) => r.key === key);
  const [from, setFrom] = useState(monthsAgo(1));
  const [to, setTo] = useState(today());
  const [variant, setVariant] = useState("");
  const v = variant || report?.variants?.[0]?.key || "";

  const ctx = useMemo(() => (l ? { from, to, variant: v, l } : null), [from, to, v, l]);
  const { data, error, loading } = useLoad(async () => (report && ctx ? report.load(ctx) : null), [report?.key, ctx]);
  const columns = report && ctx ? report.columns(ctx) : [];
  const title = report ? `${report.title}${report.variants ? ` — ${report.variants.find((x) => x.key === v)?.label}` : ""}` : "";
  const subtitle = report?.dated ? `${report.dated} ${date(from)} and ${date(to)}` : "";
  const filename = `${report?.key}-${v || "all"}-${today()}`;

  if (!available.length) return <PageHeader title="Reports" subtitle="You don't have access to any reports." />;

  return (
    <>
      <PageHeader title="Reports" subtitle="Choose a report, adjust the filters, then export to Excel, CSV or PDF." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-5">
          {(["Properties", "CRM", "Contracts", "Payments"] as const).map((g) => {
            const items = available.filter((r) => r.group === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{g}</p>
                <ul className="space-y-0.5">
                  {items.map((r) => (
                    <li key={r.key}>
                      <button onClick={() => { setKey(r.key); setVariant(""); }}
                        className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${r.key === key ? "bg-brand-50 font-medium text-brand-800" : "text-stone-700 hover:bg-stone-100"}`}>{r.title}</button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {report && (
          <Card title={title} actions={data && data.length > 0 && <>
            <Button variant="secondary" onClick={() => exportXlsx(filename, report.title, columns, data)}><FileSpreadsheet size={16} /> Excel</Button>
            <Button variant="secondary" onClick={() => exportCsv(filename, columns, data)}><Download size={16} /> CSV</Button>
            <Button variant="secondary" onClick={() => exportPdf(title, columns, data, subtitle)}><Printer size={16} /> PDF</Button>
          </>}>
            <div className="mb-5 flex flex-wrap items-end gap-3">
              {report.variants && (
                <Field label="View"><Select value={v} onChange={(e) => setVariant(e.target.value)}>{report.variants.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select></Field>
              )}
              {report.dated && <>
                <Field label={report.dated.startsWith("Not") ? "Not updated since" : "From"}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                {!report.dated.startsWith("Not") && <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>}
              </>}
            </div>
            <ErrorBox error={error} />
            {loading ? <Spinner /> : data && (
              data.length === 0 ? <p className="py-8 text-center text-sm text-stone-500">No records for this report and filter.</p> : (
                <>
                  <p className="mb-2 text-xs text-stone-500">{data.length} rows{data.length > 200 ? " — showing the first 200; export to see all" : ""}</p>
                  <div className="-mx-5 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead><tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">{columns.map((c) => <th key={c.key} className="px-5 py-2 whitespace-nowrap">{c.header}</th>)}</tr></thead>
                      <tbody className="divide-y divide-stone-100">
                        {data.slice(0, 200).map((r, i) => (
                          <tr key={i}>{columns.map((c) => {
                            const val = c.value ? c.value(r) : r[c.key];
                            return <td key={c.key} className={`px-5 py-2 ${typeof val === "number" ? "text-right tabular-nums whitespace-nowrap" : ""}`}>{typeof val === "number" ? fmt(val) : String(val ?? "")}</td>;
                          })}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            )}
          </Card>
        )}
      </div>
    </>
  );
}
