import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../auth";
import { date, daysFromToday, label, money, q, supabase, today, useLoad, useLookups, type Row } from "../lib";
import { RecordPicker } from "../pickers";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Table, Tabs, Textarea, formValues, useAction } from "../ui";

export default function ScheduleList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const tab = params.get("tab") ?? "schedules";
  const status = params.get("status") ?? "";
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  const schedules = useLoad(async () => {
    if (tab !== "schedules") return null;
    let query = supabase.from("schedule_balances").select("*").order("next_due_date", { ascending: true, nullsFirst: false }).limit(500);
    if (status) query = query.eq("status", status);
    const rows = await q<Row[]>(query);
    const ids = [...new Set(rows.map((r) => r.customer_id))];
    const customers = ids.length ? await q<Row[]>(supabase.from("customers").select("id, full_name").in("id", ids)) : [];
    return rows.map((r) => ({ ...r, customer: customers.find((c) => c.id === r.customer_id)?.full_name })) as Row[];
  }, [tab, status]);

  const due = useLoad(async () => {
    if (tab !== "due") return null;
    let query = supabase.from("installment_balances").select("*").gt("outstanding", 0).order("due_date").limit(500);
    if (status) query = query.eq("status", status);
    else query = query.lte("due_date", daysFromToday(30));
    return q<Row[]>(query);
  }, [tab, status]);

  const received = useLoad(async () => tab === "received"
    ? q<Row[]>(supabase.from("payment_receipts").select("*").order("recorded_at", { ascending: false }).limit(300)) : null, [tab]);

  return (
    <>
      <PageHeader title="Payments" subtitle="Payment schedules, installments and receipts."
        actions={can("payments.record") && <Button onClick={() => setCreating(true)}><Plus size={16} /> New schedule</Button>} />
      <Tabs value={tab} onChange={(k) => { const n = new URLSearchParams(); if (k !== "schedules") n.set("tab", k); setParams(n, { replace: true }); }} tabs={[
        { key: "schedules", label: "Schedules" }, { key: "due", label: "Due and overdue" }, { key: "received", label: "Payments received" },
      ]} />
      <Card>
        {tab !== "received" && (
          <div className="mb-4 max-w-xs">
            <Select value={status} onChange={(e) => set("status", e.target.value)}>
              <option value="">{tab === "due" ? "Due in the next 30 days and overdue" : "All statuses"}</option>
              {["overdue", "due", "partially_paid", "upcoming", "disputed", ...(tab === "schedules" ? ["paid", "cancelled"] : [])].map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </Select>
          </div>
        )}
        <ErrorBox error={schedules.error ?? due.error ?? received.error} />
        {tab === "schedules" && (
          <Table rows={schedules.data} onRowClick={(r) => navigate(`/admin/payments/${r.id}`)} empty="No schedules." columns={[
            { key: "ref", header: "Schedule", render: (r) => <><span className="font-medium">{r.ref}</span><span className="block text-xs text-stone-500">{r.title}</span></> },
            { key: "customer", header: "Customer", render: (r) => <>{r.customer}{r.direction === "outgoing" && <span className="block text-xs text-amber-700">We pay</span>}</> },
            { key: "payment_type", header: "Type", render: (r) => label(r.payment_type) },
            { key: "total", header: "Total", className: "whitespace-nowrap", render: (r) => money(r.total, r.currency) },
            { key: "paid", header: "Paid", className: "whitespace-nowrap", render: (r) => money(r.paid, r.currency) },
            { key: "outstanding", header: "Outstanding", className: "whitespace-nowrap", render: (r) => <span className={r.overdue > 0 ? "font-medium text-red-600" : ""}>{money(r.outstanding, r.currency)}</span> },
            { key: "next_due_date", header: "Next due", className: "whitespace-nowrap", render: (r) => date(r.next_due_date) },
            { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
          ]} />
        )}
        {tab === "due" && (
          <Table rows={due.data} onRowClick={(r) => navigate(`/admin/payments/${r.schedule_id}`)} empty="Nothing due." columns={[
            { key: "due_date", header: "Due", className: "whitespace-nowrap", render: (r) => <>{date(r.due_date)}{r.days_overdue > 0 && <span className="block text-xs text-red-600">{r.days_overdue} days late</span>}</> },
            { key: "schedule_ref", header: "Schedule", render: (r) => <><span className="font-medium">{r.schedule_ref}</span><span className="block text-xs text-stone-500">{r.schedule_title}</span></> },
            { key: "description", header: "Installment" },
            { key: "amount", header: "Amount", className: "whitespace-nowrap", render: (r) => money(r.amount, r.currency) },
            { key: "outstanding", header: "Outstanding", className: "whitespace-nowrap", render: (r) => money(r.outstanding, r.currency) },
            { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
          ]} />
        )}
        {tab === "received" && (
          <Table rows={received.data} onRowClick={(r) => window.open(`/admin/receipt/${r.id}`, "_blank")} empty="No payments recorded." columns={[
            { key: "receipt_no", header: "Receipt", className: "whitespace-nowrap" },
            { key: "paid_on", header: "Date", className: "whitespace-nowrap", render: (r) => date(r.paid_on) },
            { key: "customer_name", header: "Customer" },
            { key: "property_refs", header: "Applied to", render: (r) => <>{r.property_refs ?? "—"}<span className="block text-xs text-stone-500">{r.installments ?? "Unallocated"}</span></> },
            { key: "method", header: "Method", render: (r) => <>{label(r.method)}{r.reference_no && <span className="block text-xs text-stone-500">{r.reference_no}</span>}</> },
            { key: "amount", header: "Amount", className: "whitespace-nowrap", render: (r) => <span className={r.voided_at ? "text-stone-400 line-through" : ""}>{money(r.amount, r.currency)}</span> },
            { key: "voided_at", header: "", render: (r) => r.voided_at ? <Badge tone="red">Reversed</Badge> : null },
          ]} />
        )}
      </Card>
      {creating && <NewSchedule onClose={() => setCreating(false)} onCreated={(id) => navigate(`/admin/payments/${id}`)} />}
    </>
  );
}

export interface ScheduleDefaults {
  customer?: Row; property_id?: string; transaction_id?: string; contract_id?: string;
  currency?: string; title?: string; total?: number; direction?: "incoming" | "outgoing";
}

export function NewSchedule({ onClose, onCreated, defaults = {} }: { onClose: () => void; onCreated: (id: string) => void; defaults?: ScheduleDefaults }) {
  const l = useLookups();
  const act = useAction();
  const [customer, setCustomer] = useState<Row | null>(defaults.customer ?? null);
  const [reference, setReference] = useState<string>(defaults.transaction_id ? `t:${defaults.transaction_id}` : defaults.contract_id ? `c:${defaults.contract_id}` : "");
  const [type, setType] = useState("installments");

  const refs = useLoad(async () => {
    if (!customer || defaults.transaction_id || defaults.contract_id) return [];
    const [tx, ct] = await Promise.all([
      q<Row[]>(supabase.from("transaction_parties").select("transactions(id, ref, property_id, agreed_price, currency, properties(title))").eq("customer_id", customer.id)),
      q<Row[]>(supabase.from("contract_parties").select("contracts(id, ref, property_id, value, rent_amount, currency, properties(title))").eq("customer_id", customer.id)),
    ]);
    return [
      ...tx.filter((x) => x.transactions).map((x) => ({ key: `t:${x.transactions.id}`, label: `${x.transactions.ref} — ${x.transactions.properties?.title}`, property_id: x.transactions.property_id, currency: x.transactions.currency })),
      ...ct.filter((x) => x.contracts).map((x) => ({ key: `c:${x.contracts.id}`, label: `${x.contracts.ref} — ${x.contracts.properties?.title}`, property_id: x.contracts.property_id, currency: x.contracts.currency })),
    ];
  }, [customer?.id]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    if (!customer) return act.setError("Choose the customer who pays");
    if (!reference) return act.setError("Choose the transaction or contract this payment is for");
    const ref = refs.data?.find((r) => r.key === reference);
    const [kind, refId] = reference.split(":");
    await act.run(async () => {
      const s = await q<Row>(supabase.from("payment_schedules").insert({
        title: v.title, customer_id: customer.id, property_id: defaults.property_id ?? ref?.property_id,
        transaction_id: kind === "t" ? refId : null, contract_id: kind === "c" ? refId : null,
        currency: defaults.currency ?? ref?.currency ?? "PKR", payment_type: type, direction: v.direction, notes: v.notes,
      }).select("id").single());
      const count = type === "installments" ? Number(v.count) : 1;
      const every = v.every === "quarter" ? "3 months" : v.every === "half" ? "6 months" : v.every === "year" ? "1 year" : "1 month";
      await q(supabase.rpc("add_installments", {
        p_schedule: s.id, p_total: Number(v.total), p_count: count, p_first_due: v.first_due, p_every: every,
        p_label: type === "installments" ? "Installment" : label(type),
      }));
      onCreated(s.id);
    });
  }

  return (
    <Modal title="New payment schedule" open onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer (payer or payee)"><RecordPicker table="customers" initial={customer} onPick={setCustomer} /></Field>
        <Field label="For">
          {defaults.transaction_id || defaults.contract_id
            ? <Input disabled value={defaults.title ?? "Linked record"} />
            : <Select value={reference} onChange={(e) => setReference(e.target.value)} disabled={!customer}>
                <option value="">{customer ? (refs.data?.length ? "Choose transaction or contract…" : "This customer has no transactions or contracts") : "Choose a customer first"}</option>
                {refs.data?.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </Select>}
        </Field>
        <Field label="Title" className="sm:col-span-2"><Input name="title" required defaultValue={defaults.title ?? ""} /></Field>
        <Field label="Payment type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {["full", "installments", "advance", "security_deposit", "other"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
        </Field>
        <Field label="Direction">
          <Select name="direction" defaultValue={defaults.direction ?? "incoming"}>
            <option value="incoming">Customer pays us</option><option value="outgoing">We pay the customer (purchase)</option>
          </Select>
        </Field>
        <Field label={`Total amount (${defaults.currency ?? "PKR"})`}><Input name="total" type="number" min={1} step="any" required defaultValue={defaults.total ?? ""} /></Field>
        <Field label={type === "installments" ? "First due date" : "Due date"}><Input name="first_due" type="date" required defaultValue={today()} /></Field>
        {type === "installments" && <>
          <Field label="Number of installments"><Input name="count" type="number" min={2} max={600} required defaultValue={12} /></Field>
          <Field label="Every">
            <Select name="every" defaultValue="month"><option value="month">Month</option><option value="quarter">Quarter</option><option value="half">6 months</option><option value="year">Year</option></Select>
          </Field>
        </>}
        <Field label="Notes and terms" className="sm:col-span-2"><Textarea name="notes" rows={2} /></Field>
        <p className="text-xs text-stone-500 sm:col-span-2">
          For rental contracts, use “Create rent schedule” on the contract — it builds monthly rent, deposit and advance automatically. Only one live schedule of each type is allowed per transaction or contract.
        </p>
        <div className="sm:col-span-2"><ErrorBox error={act.error} /><Button type="submit" busy={act.busy}>Create schedule</Button></div>
        {!l && null}
      </form>
    </Modal>
  );
}
