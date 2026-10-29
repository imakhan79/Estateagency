import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { date, dateTime, money, q, supabase, today, useLoad, type Row } from "../lib";
import { Badge, Card, ErrorBox, Field, Input, PageHeader, Stat, Table } from "../ui";

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { staff, can } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const summary = useLoad(() => q<Row>(supabase.rpc("dashboard_summary", { p_from: from, p_to: to })), [from, to]);
  const followUps = useLoad(() =>
    q(supabase.from("activities").select("id, kind, subject, due_at, lead_id, customer_id, leads(name), customers(full_name)")
      .is("completed_at", null).not("due_at", "is", null).eq("assigned_to", staff!.id).order("due_at").limit(10)));
  const renewals = useLoad(async () =>
    can("contracts.view") || can("contracts.view_own")
      ? q(supabase.from("contract_renewals").select("*").lte("days_remaining", 60).order("end_date").limit(8))
      : [], []);
  const overdue = useLoad(async () =>
    can("payments.view")
      ? q(supabase.from("installment_balances").select("id, schedule_id, schedule_ref, description, due_date, outstanding, currency, days_overdue, customer_id").eq("status", "overdue").order("due_date").limit(8))
      : [], []);

  const s = summary.data;
  const showMoney = can("payments.view");

  return (
    <>
      <PageHeader
        title={`Welcome, ${staff?.full_name?.split(" ")[0] ?? ""}`}
        subtitle="Figures reflect the records your role can see."
        actions={
          <div className="flex items-end gap-2">
            <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        }
      />
      <ErrorBox error={summary.error} />

      {s && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-stone-500">Property inventory</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Stat label="Total" value={s.properties.total} to="/admin/properties" />
              <Stat label="Available" value={s.properties.available} to="/admin/properties?availability=available" />
              <Stat label="For sale" value={s.properties.for_sale} to="/admin/properties?listing=sale&publication=published" />
              <Stat label="For rent" value={s.properties.for_rent} to="/admin/properties?listing=rent&publication=published" />
              <Stat label="Sold" value={s.properties.sold} to="/admin/properties?availability=sold" />
              <Stat label="Rented" value={s.properties.rented} to="/admin/properties?availability=rented" />
              <Stat label="Archived" value={s.properties.archived} to="/admin/properties?publication=archived" />
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-stone-500">Leads and deals</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="New leads in period" value={s.leads.new_in_period} to="/admin/leads" />
              <Stat label="Unassigned" value={s.leads.unassigned} tone={s.leads.unassigned ? "amber" : undefined} to="/admin/leads?assigned=none" />
              <Stat label="Awaiting follow-up" value={s.leads.awaiting_follow_up} tone={s.leads.awaiting_follow_up ? "amber" : undefined} to="/admin/leads?followup=due" />
              <Stat label="Overdue follow-ups" value={s.follow_ups_overdue} tone={s.follow_ups_overdue ? "red" : undefined} />
              <Stat label="Active negotiations" value={s.leads.active_negotiations} to="/admin/leads?stage=negotiation" />
              <Stat label="Deals in progress" value={s.transactions_in_progress} to="/admin/transactions" />
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-stone-500">Contracts and payments</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Active rental contracts" value={s.contracts.active_rentals} to="/admin/contracts?status=active" />
              <Stat label="Expiring within 30 days" value={s.contracts.expiring_soon} tone={s.contracts.expiring_soon ? "amber" : undefined} to="/admin/contracts?tab=renewals" />
              {showMoney && <>
                <Stat label="Received in period" value={money(s.payments.received_in_period)} tone="green" />
                <Stat label="Outstanding" value={money(s.payments.outstanding)} to="/admin/payments" />
                <Stat label="Overdue" value={money(s.payments.overdue)} tone={s.payments.overdue ? "red" : undefined} to="/admin/payments?status=overdue" />
                <Stat label="Due in next 30 days" value={money(s.payments.upcoming_30_days)} />
              </>}
              {s.transactions_pending_approval > 0 && can("transactions.approve") && (
                <Stat label="Awaiting your approval" value={s.transactions_pending_approval} tone="amber" to="/admin/transactions?approval=pending" />
              )}
            </div>
          </section>
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Card title="My follow-ups">
          <Table rows={followUps.data} empty="No open follow-ups." columns={[
            { key: "subject", header: "Task", render: (r) => (
              <Link className="font-medium text-brand-700 hover:underline" to={r.lead_id ? `/admin/leads/${r.lead_id}` : `/admin/customers/${r.customer_id}`}>
                {r.subject}<span className="block text-xs font-normal text-stone-500">{r.leads?.name ?? r.customers?.full_name}</span>
              </Link>) },
            { key: "due_at", header: "Due", render: (r) => <span className={new Date(r.due_at) < new Date() ? "text-red-600" : ""}>{dateTime(r.due_at)}</span> },
          ]} />
        </Card>
        <Card title="Contracts ending soon">
          <Table rows={renewals.data} empty="Nothing ending in the next 60 days." columns={[
            { key: "ref", header: "Contract", render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`/admin/contracts/${r.id}`}>{r.ref}<span className="block text-xs font-normal text-stone-500">{r.property_title}</span></Link> },
            { key: "end_date", header: "Ends", render: (r) => <>{date(r.end_date)}<span className="block text-xs text-stone-500">{r.days_remaining} days</span></> },
            { key: "renewal_status", header: "Renewal", render: (r) => <Badge status={r.renewal_status ?? "not_contacted"} /> },
          ]} />
        </Card>
        {showMoney && (
          <Card title="Overdue payments">
            <Table rows={overdue.data} empty="No overdue payments." columns={[
              { key: "schedule_ref", header: "Schedule", render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`/admin/payments/${r.schedule_id}`}>{r.schedule_ref}<span className="block text-xs font-normal text-stone-500">{r.description}</span></Link> },
              { key: "outstanding", header: "Outstanding", render: (r) => <>{money(r.outstanding, r.currency)}<span className="block text-xs text-red-600">{r.days_overdue} days late</span></> },
            ]} />
          </Card>
        )}
      </div>
    </>
  );
}
