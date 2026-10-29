import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, Trash2 } from "lucide-react";
import { useAuth } from "../auth";
import { date, dateTime, money, nameOf, q, supabase, useLoad, useLookups, type Row } from "../lib";
import { RecordPicker } from "../pickers";
import { Badge, Button, Card, DL, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Textarea, formValues, useAction } from "../ui";
import { NewSchedule } from "./ScheduleList";
import { DealCommissions } from "./Commissions";

export default function TransactionDetail() {
  const { id } = useParams();
  const { can, staff } = useAuth();
  const l = useLookups();
  const navigate = useNavigate();
  const act = useAction();
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const { data: t, error, reload } = useLoad(() =>
    q<Row>(supabase.from("transactions").select("*, properties(id, ref, title), leads(id, ref, name), transaction_parties(customer_id, role, customers(id, ref, full_name, mobile))").eq("id", id!).single()), [id]);
  const issues = useLoad(() => q<string[]>(supabase.rpc("transaction_completion_issues", { p_transaction: id })), [id, t?.updated_at]);
  const contracts = useLoad(() => q<Row[]>(supabase.from("contracts").select("id, ref, status, type_id, signed_on").eq("transaction_id", id!)), [id]);
  const schedules = useLoad(async () => can("payments.view") ? q<Row[]>(supabase.from("schedule_balances").select("*").eq("transaction_id", id!)) : ([] as Row[]), [id]);

  if (!t || !l) return error ? <ErrorBox error={error} /> : <Spinner />;

  const editable = can("transactions.edit") && (can("transactions.view") || t.agent_id === staff?.id);
  const update = (patch: Row) => act.run(() => q(supabase.from("transactions").update(patch).eq("id", t.id)), reload);
  const status = l.txStatuses.find((s) => s.id === t.status_id);
  const buyer = t.transaction_parties.find((p: Row) => p.role === "buyer");

  return (
    <>
      <PageHeader
        back={{ to: "/admin/transactions", label: "Sales and purchases" }}
        title={`${t.kind === "sale" ? "Sale" : "Purchase"} of ${t.properties.title}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">{t.ref} <Badge tone="blue">{status?.name}</Badge>{t.approval_status !== "not_required" && <Badge status={t.approval_status}>Approval: {t.approval_status}</Badge>}</span>}
        actions={<>
          {editable && ["not_required", "rejected"].includes(t.approval_status) && <Button variant="secondary" busy={act.busy} onClick={() => update({ approval_status: "pending" })}>Submit for approval</Button>}
          {can("transactions.approve") && t.approval_status === "pending" && <>
            <Button busy={act.busy} onClick={() => update({ approval_status: "approved" })}>Approve</Button>
            <Button variant="secondary" onClick={() => setRejecting(true)}>Reject</Button>
          </>}
          {can("contracts.edit") && <Button variant="secondary" onClick={() => navigate(`/admin/contracts?new=1&transaction=${t.id}`)}>Create contract</Button>}
          {can("payments.record") && buyer && <Button variant="secondary" onClick={() => setScheduling(true)}>Payment schedule</Button>}
        </>}
      />
      <ErrorBox error={act.error} />
      {t.approval_note && <p className="mb-4 rounded-lg bg-stone-100 px-4 py-3 text-sm">Approval note: {t.approval_note}</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title="Deal" actions={editable && <Button variant="ghost" onClick={() => setEditing(true)}>Edit terms</Button>}>
            <DL items={[
              ["Property", <Link className="text-brand-700" to={`/admin/properties/${t.properties.id}`}>{t.properties.ref} {t.properties.title}</Link>],
              ["Lead", t.leads ? <Link className="text-brand-700" to={`/admin/leads/${t.leads.id}`}>{t.leads.ref} {t.leads.name}</Link> : null],
              ["Agreed price", money(t.agreed_price, t.currency)], ["Deposit / advance", money(t.deposit, t.currency)],
              ["Date", date(t.transaction_date)], ["Agent", nameOf(l.staff, t.agent_id, "id", "full_name")],
              ["Approved by", t.approved_by ? `${nameOf(l.staff, t.approved_by, "id", "full_name")}, ${dateTime(t.approved_at)}` : null],
            ]} />
            {t.payment_terms && <p className="mt-4 whitespace-pre-line text-sm"><span className="font-medium">Payment terms:</span> {t.payment_terms}</p>}
            {t.notes && <p className="mt-2 whitespace-pre-line text-sm text-stone-600">{t.notes}</p>}
          </Card>

          <Card title="Status">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Transaction status">
                <Select value={t.status_id} disabled={!(editable || can("transactions.cancel")) || act.busy} onChange={(e) => update({ status_id: Number(e.target.value) })}>
                  {l.txStatuses.filter((s) => s.active || s.id === t.status_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            </div>
            {issues.data && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Before this can be marked Completed:</p>
                {issues.data.length === 0
                  ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> All completion conditions are met.</p>
                  : <ul className="space-y-1 text-sm text-amber-800">{issues.data.map((i) => <li key={i} className="flex items-center gap-2"><CircleAlert size={14} /> {i}</li>)}</ul>}
              </div>
            )}
          </Card>

          {can("payments.view") && (
            <Card title="Payment schedules">
              <Table rows={schedules.data} empty="No payment schedule yet." onRowClick={(r) => navigate(`/admin/payments/${r.id}`)} columns={[
                { key: "ref", header: "Schedule", render: (r) => <><span className="font-medium">{r.ref}</span><span className="block text-xs text-stone-500">{r.title}</span></> },
                { key: "total", header: "Total", render: (r) => money(r.total, r.currency) },
                { key: "paid", header: "Paid", render: (r) => money(r.paid, r.currency) },
                { key: "outstanding", header: "Outstanding", render: (r) => money(r.outstanding, r.currency) },
                { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
              ]} />
            </Card>
          )}

          <DealCommissions transactionId={t.id} propertyId={t.property_id} currency={t.currency} agentId={t.agent_id} />
        </div>

        <div className="space-y-6">
          <Parties t={t} editable={editable} onChange={reload} />
          <Card title="Contracts">
            {contracts.data?.length === 0 && <p className="text-sm text-stone-500">No contract yet.</p>}
            <ul className="space-y-2 text-sm">
              {contracts.data?.map((c) => <li key={c.id}><Link className="text-brand-700 hover:underline" to={`/admin/contracts/${c.id}`}>{c.ref}</Link> · {nameOf(l.contractTypes, c.type_id)} <Badge status={c.status} /></li>)}
            </ul>
          </Card>
          {can("records.delete") && (
            <Button variant="ghost" className="text-red-600" onClick={() => {
              if (window.confirm("Delete this transaction? This is only possible when it has no contracts or payment schedules."))
                act.run(() => q(supabase.from("transactions").delete().eq("id", t.id)), () => navigate("/admin/transactions"));
            }}><Trash2 size={16} /> Delete transaction</Button>
          )}
        </div>
      </div>

      <Modal title="Edit terms" open={editing} onClose={() => setEditing(false)}>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          if (await act.run(() => q(supabase.from("transactions").update({
            agreed_price: v.agreed_price ? Number(v.agreed_price) : null, deposit: v.deposit ? Number(v.deposit) : null,
            transaction_date: v.transaction_date, payment_terms: v.payment_terms, notes: v.notes, agent_id: v.agent_id,
          }).eq("id", t.id)), reload)) setEditing(false);
        }}>
          <Field label="Agreed price"><Input name="agreed_price" type="number" defaultValue={t.agreed_price ?? ""} /></Field>
          <Field label="Deposit / advance"><Input name="deposit" type="number" defaultValue={t.deposit ?? ""} /></Field>
          <Field label="Date"><Input name="transaction_date" type="date" defaultValue={t.transaction_date} /></Field>
          <Field label="Agent"><Select name="agent_id" defaultValue={t.agent_id ?? ""}>{l.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
          <Field label="Payment terms"><Textarea name="payment_terms" defaultValue={t.payment_terms ?? ""} /></Field>
          <Field label="Notes"><Textarea name="notes" defaultValue={t.notes ?? ""} /></Field>
          {t.approval_status === "approved" && !can("transactions.approve") && <p className="text-xs text-amber-700">Changing price, deposit or terms sends this deal back for approval.</p>}
          <ErrorBox error={act.error} />
          <Button type="submit" busy={act.busy}>Save</Button>
        </form>
      </Modal>

      <Modal title="Reject transaction" open={rejecting} onClose={() => setRejecting(false)}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (await act.run(() => q(supabase.from("transactions").update({ approval_status: "rejected", approval_note: formValues(e.currentTarget).note }).eq("id", t.id)), reload)) setRejecting(false);
        }}>
          <Field label="Reason (shown to the agent)"><Textarea name="note" required /></Field>
          <Button type="submit" variant="danger" busy={act.busy}>Reject</Button>
        </form>
      </Modal>

      {scheduling && buyer && (
        <NewSchedule onClose={() => setScheduling(false)} onCreated={(sid) => navigate(`/admin/payments/${sid}`)}
          defaults={{ customer: buyer.customers, property_id: t.property_id, transaction_id: t.id, currency: t.currency,
            title: `${t.kind === "sale" ? "Sale" : "Purchase"} price — ${t.properties.ref}`, total: t.agreed_price,
            direction: t.kind === "purchase" ? "outgoing" : "incoming" }} />
      )}
    </>
  );
}

function Parties({ t, editable, onChange }: { t: Row; editable: boolean; onChange: () => void }) {
  const act = useAction();
  const [customer, setCustomer] = useState<Row | null>(null);
  const [role, setRole] = useState("buyer");
  const [key, setKey] = useState(0);

  return (
    <Card title="Parties">
      <ErrorBox error={act.error} />
      {t.transaction_parties.length === 0 && <p className="mb-3 text-sm text-stone-500">Add the buyer and seller.</p>}
      <ul className="mb-4 space-y-2">
        {t.transaction_parties.map((p: Row) => (
          <li key={`${p.customer_id}-${p.role}`} className="flex items-center justify-between gap-2 text-sm">
            <span><Link className="text-brand-700 hover:underline" to={`/admin/customers/${p.customer_id}`}>{p.customers.full_name}</Link> <Badge>{p.role.replace("_", "-")}</Badge>
              <span className="block text-xs text-stone-500">{p.customers.mobile}</span></span>
            {editable && <button className="text-xs text-red-600 hover:underline" onClick={() => act.run(() => q(supabase.from("transaction_parties").delete().match({ transaction_id: t.id, customer_id: p.customer_id, role: p.role })), onChange)}>Remove</button>}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="space-y-2 border-t border-stone-100 pt-4">
          <RecordPicker key={key} table="customers" onPick={setCustomer} />
          <div className="flex gap-2">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {["buyer", "seller", "co_buyer", "co_seller", "guarantor", "witness", "other"].map((r) => <option key={r} value={r}>{r.replace("_", "-")}</option>)}
            </Select>
            <Button variant="secondary" disabled={!customer} busy={act.busy} onClick={() => act.run(
              () => q(supabase.from("transaction_parties").insert({ transaction_id: t.id, customer_id: customer!.id, role })),
              () => { setCustomer(null); setKey(key + 1); onChange(); })}>Add</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
