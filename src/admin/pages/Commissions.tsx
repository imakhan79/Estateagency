import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../auth";
import { date, label, money, q, supabase, today, useLoad, useLookups, type Row } from "../lib";
import { RecordPicker } from "../pickers";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Stat, Table, Textarea, formValues, useAction } from "../ui";

const SELECT = "*, properties(id, ref, title), transactions(id, ref), contracts(id, ref), payer:customers!commissions_payer_customer_id_fkey(id, full_name), referrer:customers!commissions_payee_customer_id_fkey(id, full_name), staff:staff!commissions_payee_staff_id_fkey(full_name)";

const KIND_LABEL: Record<string, string> = { brokerage: "Brokerage (we earn)", agent: "Agent (we pay)", referral: "Referral (we pay)" };

export default function Commissions() {
  const { can, staff } = useAuth();
  const l = useLookups();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  const { data, error, reload } = useLoad(async () => {
    let query = supabase.from("commissions").select(SELECT).order("created_at", { ascending: false }).limit(1000);
    if (get("status")) query = query.eq("status", get("status"));
    else query = query.neq("status", "cancelled");
    if (get("kind")) query = query.eq("kind", get("kind"));
    if (get("agent")) query = query.eq("payee_staff_id", get("agent"));
    return q<Row[]>(query);
  }, [params.toString()]);

  const sum = (rows: Row[] | null, f: (r: Row) => boolean) => (rows ?? []).filter(f).reduce((a, r) => a + Number(r.amount), 0);
  const mineOnly = !can("commissions.view");

  return (
    <>
      <PageHeader title={mineOnly ? "My commissions" : "Commissions"}
        subtitle="Brokerage the agency earns, and commission payable to agents and referrers. Calculated from the rules in Settings when a sale completes or a rental contract goes active." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!mineOnly && <Stat label="Brokerage to collect" value={money(sum(data, (r) => r.kind === "brokerage" && r.status !== "paid"))} tone="amber" />}
        {!mineOnly && <Stat label="Brokerage collected" value={money(sum(data, (r) => r.kind === "brokerage" && r.status === "paid"))} tone="green" />}
        <Stat label={mineOnly ? "Owed to me" : "Payable to agents and referrers"} value={money(sum(data, (r) => r.kind !== "brokerage" && ["pending", "approved"].includes(r.status)))} />
        <Stat label={mineOnly ? "Paid to me" : "Paid out"} value={money(sum(data, (r) => r.kind !== "brokerage" && r.status === "paid"))} tone="green" />
      </div>
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Select value={get("status")} onChange={(e) => set("status", e.target.value)}>
            <option value="">Pending, approved and paid</option>
            {["pending", "approved", "paid", "cancelled"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
          <Select value={get("kind")} onChange={(e) => set("kind", e.target.value)}>
            <option value="">All kinds</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {!mineOnly && (
            <Select value={get("agent")} onChange={(e) => set("agent", e.target.value)}>
              <option value="">All agents</option>
              {l?.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
          )}
        </div>
        <ErrorBox error={error} />
        <CommissionTable rows={data} onChange={reload} showDeal />
      </Card>
      {staff && null}
    </>
  );
}

export function CommissionTable({ rows, onChange, showDeal }: { rows: Row[] | null; onChange: () => void; showDeal?: boolean }) {
  const { can } = useAuth();
  const act = useAction();
  const [paying, setPaying] = useState<Row | null>(null);
  const [cancelling, setCancelling] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const update = (r: Row, patch: Row) => act.run(() => q(supabase.from("commissions").update(patch).eq("id", r.id)), onChange);

  return (
    <>
      <ErrorBox error={act.error} />
      <Table rows={rows} empty="No commissions." columns={[
        { key: "ref", header: "Ref", className: "whitespace-nowrap text-stone-500" },
        { key: "kind", header: "Kind", render: (r) => <Badge tone={r.kind === "brokerage" ? "green" : "purple"}>{r.kind}</Badge> },
        { key: "party", header: "From / to", render: (r) => r.kind === "brokerage"
          ? <>From {r.payer ? <Link className="text-brand-700 hover:underline" to={`/admin/customers/${r.payer.id}`}>{r.payer.full_name}</Link> : "—"}</>
          : r.kind === "agent" ? <>To {r.staff?.full_name}</>
          : <>To {r.referrer ? <Link className="text-brand-700 hover:underline" to={`/admin/customers/${r.referrer.id}`}>{r.referrer.full_name}</Link> : r.payee_name}</> },
        ...(showDeal ? [{ key: "deal", header: "Deal", render: (r: Row) => <>
          {r.transactions ? <Link className="text-brand-700 hover:underline" to={`/admin/transactions/${r.transactions.id}`}>{r.transactions.ref}</Link>
            : r.contracts ? <Link className="text-brand-700 hover:underline" to={`/admin/contracts/${r.contracts.id}`}>{r.contracts.ref}</Link> : "—"}
          <span className="block text-xs text-stone-500">{r.properties?.ref} {r.properties?.title}</span></> }] : []),
        { key: "description", header: "Basis", render: (r) => <span className="text-xs text-stone-600">{r.description}{r.basis && r.basis !== "fixed" && <span className="block text-stone-400">{r.rate}{r.basis === "months_rent" ? " × rent" : "%"} of {money(r.base_amount, r.currency)}</span>}</span> },
        { key: "amount", header: "Amount", className: "whitespace-nowrap text-right", render: (r) => <span className="font-medium">{money(r.amount, r.currency)}</span> },
        { key: "status", header: "Status", render: (r) => <><Badge status={r.status} />{r.paid_on && <span className="block text-xs text-stone-500">{date(r.paid_on)}</span>}{r.status !== "paid" && r.due_date && <span className="block text-xs text-stone-500">due {date(r.due_date)}</span>}</> },
        { key: "actions", header: "", className: "whitespace-nowrap text-right", render: (r) => (
          <span className="flex justify-end gap-1">
            {r.status === "pending" && can("commissions.manage") && <Button variant="ghost" className="px-2 py-1" onClick={() => setEditing(r)}>Edit</Button>}
            {r.status === "pending" && can("commissions.approve") && <Button className="px-2.5 py-1" busy={act.busy} onClick={() => update(r, { status: "approved" })}>Approve</Button>}
            {r.status === "approved" && can("commissions.manage") && <Button className="px-2.5 py-1" onClick={() => setPaying(r)}>{r.kind === "brokerage" ? "Mark received" : "Mark paid"}</Button>}
            {["pending", "approved"].includes(r.status) && can("commissions.approve") && <Button variant="ghost" className="px-2 py-1 text-red-600" onClick={() => setCancelling(r)}>Cancel</Button>}
          </span>) },
      ]} />

      <Modal title={`${paying?.kind === "brokerage" ? "Record brokerage received" : "Record commission paid"} — ${paying?.ref ?? ""}`} open={!!paying} onClose={() => setPaying(null)}>
        {paying && (
          <form className="grid gap-3" onSubmit={async (e) => {
            e.preventDefault();
            const v = formValues(e.currentTarget);
            if (await act.run(() => q(supabase.from("commissions").update({ status: "paid", paid_on: v.paid_on, payment_method: v.method, payment_reference: v.reference, notes: v.notes ?? paying.notes }).eq("id", paying.id)), onChange)) setPaying(null);
          }}>
            <p className="text-sm text-stone-600">{money(paying.amount, paying.currency)} — {paying.description}</p>
            <Field label="Date"><Input name="paid_on" type="date" required max={today()} defaultValue={today()} /></Field>
            <Field label="Method"><Select name="method" defaultValue="bank_transfer">{["cash", "bank_transfer", "cheque", "pay_order", "online", "other"].map((m) => <option key={m} value={m}>{label(m)}</option>)}</Select></Field>
            <Field label="Reference"><Input name="reference" /></Field>
            <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={paying.notes ?? ""} /></Field>
            <Button type="submit" busy={act.busy}>Save</Button>
          </form>
        )}
      </Modal>

      <Modal title={`Cancel ${cancelling?.ref ?? ""}`} open={!!cancelling} onClose={() => setCancelling(null)}>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          if (await act.run(() => q(supabase.from("commissions").update({ status: "cancelled", cancelled_reason: formValues(e.currentTarget).reason }).eq("id", cancelling!.id)), onChange)) setCancelling(null);
        }}>
          <Field label="Reason"><Textarea name="reason" required /></Field>
          <Button type="submit" variant="danger" busy={act.busy}>Cancel commission</Button>
        </form>
      </Modal>

      <Modal title={`Edit ${editing?.ref ?? ""}`} open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <form className="grid gap-3" onSubmit={async (e) => {
            e.preventDefault();
            const v = formValues(e.currentTarget);
            if (await act.run(() => q(supabase.from("commissions").update({ amount: Number(v.amount), due_date: v.due_date, notes: v.notes }).eq("id", editing.id)), onChange)) setEditing(null);
          }}>
            <Field label="Amount" hint="Override the calculated figure if the agreed terms were different."><Input name="amount" type="number" min={0} step="any" required defaultValue={editing.amount} /></Field>
            <Field label="Due date"><Input name="due_date" type="date" defaultValue={editing.due_date ?? ""} /></Field>
            <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={editing.notes ?? ""} /></Field>
            <Button type="submit" busy={act.busy}>Save</Button>
          </form>
        )}
      </Modal>
    </>
  );
}

/** Commission panel for a transaction or contract page. */
export function DealCommissions({ transactionId, contractId, propertyId, currency, agentId }: { transactionId?: string; contractId?: string; propertyId: string; currency: string; agentId?: string | null }) {
  const { can } = useAuth();
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const { data, reload } = useLoad(async () => {
    if (!can("commissions.view") && !can("commissions.view_own")) return null;
    let query = supabase.from("commissions").select(SELECT).order("kind").order("created_at");
    query = transactionId ? query.eq("transaction_id", transactionId) : query.eq("contract_id", contractId!);
    return q<Row[]>(query);
  }, [transactionId, contractId]);
  if (data === null) return null;

  return (
    <Card title="Commissions" actions={can("commissions.manage") && <>
      <Button variant="secondary" busy={act.busy} onClick={() => act.run(async () => {
        const added = await q<number>(supabase.rpc("calculate_commissions", transactionId ? { p_transaction: transactionId } : { p_contract: contractId }));
        if (added === 0) act.setError("Nothing new to add — every matching rule already has a commission for this deal. Add the buyer/seller or tenant/landlord first if they're missing.");
      }, reload)}>Calculate from rules</Button>
      <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={14} /> Add</Button>
    </>}>
      <ErrorBox error={act.error} />
      <CommissionTable rows={data} onChange={reload} />
      {adding && <AddCommission onClose={() => setAdding(false)} onSaved={reload} deal={{ transactionId, contractId, propertyId, currency, agentId }} />}
    </Card>
  );
}

function AddCommission({ onClose, onSaved, deal }: { onClose: () => void; onSaved: () => void; deal: { transactionId?: string; contractId?: string; propertyId: string; currency: string; agentId?: string | null } }) {
  const l = useLookups();
  const act = useAction();
  const [kind, setKind] = useState("referral");
  const [party, setParty] = useState<Row | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    if (kind === "brokerage" && !party) return act.setError("Choose who pays the brokerage");
    if (kind === "referral" && !party && !v.payee_name) return act.setError("Choose the referrer or type their name");
    await act.run(() => q(supabase.from("commissions").insert({
      kind, property_id: deal.propertyId, transaction_id: deal.transactionId ?? null, contract_id: deal.contractId ?? null,
      description: v.description, amount: Number(v.amount), currency: deal.currency, basis: "fixed", due_date: v.due_date,
      payer_customer_id: kind === "brokerage" ? party?.id : null,
      payee_customer_id: kind === "referral" ? party?.id ?? null : null,
      payee_name: kind === "referral" && !party ? v.payee_name : null,
      payee_staff_id: kind === "agent" ? v.payee_staff_id : null,
      notes: v.notes,
    })), () => { onSaved(); onClose(); });
  }

  return (
    <Modal title="Add commission" open onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Field label="Kind">
          <Select value={kind} onChange={(e) => { setKind(e.target.value); setParty(null); }}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        {kind === "brokerage" && <Field label="Paid by"><RecordPicker table="customers" onPick={setParty} /></Field>}
        {kind === "agent" && (
          <Field label="Agent"><Select name="payee_staff_id" required defaultValue={deal.agentId ?? ""}>{l?.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
        )}
        {kind === "referral" && <>
          <Field label="Referrer (if a customer on file)"><RecordPicker table="customers" onPick={setParty} /></Field>
          {!party && <Field label="…or referrer's name"><Input name="payee_name" /></Field>}
        </>}
        <Field label="Description"><Input name="description" required defaultValue={kind === "referral" ? "Referral fee" : ""} /></Field>
        <Field label={`Amount (${deal.currency})`}><Input name="amount" type="number" min={0} step="any" required /></Field>
        <Field label="Due date"><Input name="due_date" type="date" /></Field>
        <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
        <ErrorBox error={act.error} />
        <Button type="submit" busy={act.busy}>Add commission</Button>
      </form>
    </Modal>
  );
}
