import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../auth";
import { date, money, nameOf, q, supabase, today, useLoad, useLookups, type Row } from "../lib";
import { RecordPicker } from "../pickers";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Table, Textarea, formValues, useAction } from "../ui";

export default function TransactionList() {
  const { can } = useAuth();
  const l = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get("new") === "1");
  const get = (k: string) => params.get(k) ?? "";
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  const { data, error } = useLoad(async () => {
    let query = supabase.from("transactions")
      .select("id, ref, kind, agreed_price, currency, status_id, approval_status, agent_id, transaction_date, properties(ref, title), transaction_parties(role, customers(full_name))")
      .order("created_at", { ascending: false }).limit(500);
    if (get("status")) query = query.eq("status_id", Number(get("status")));
    if (get("kind")) query = query.eq("kind", get("kind"));
    if (get("approval")) query = query.eq("approval_status", get("approval"));
    return q<Row[]>(query);
  }, [params.toString()]);

  return (
    <>
      <PageHeader title="Sales and purchases" subtitle="From negotiation to contract and settlement."
        actions={can("transactions.edit") && <Button onClick={() => setCreating(true)}><Plus size={16} /> New transaction</Button>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Select value={get("status")} onChange={(e) => set("status", e.target.value)}>
            <option value="">All statuses</option>
            {l?.txStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={get("kind")} onChange={(e) => set("kind", e.target.value)}>
            <option value="">Sales and purchases</option><option value="sale">Sales</option><option value="purchase">Purchases</option>
          </Select>
          <Select value={get("approval")} onChange={(e) => set("approval", e.target.value)}>
            <option value="">Any approval state</option>
            {["pending", "approved", "rejected", "not_required"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </Select>
        </div>
        <ErrorBox error={error} />
        <Table rows={data} onRowClick={(r) => navigate(`/admin/transactions/${r.id}`)} empty="No transactions." columns={[
          { key: "ref", header: "Ref", className: "whitespace-nowrap text-stone-500" },
          { key: "property", header: "Property", render: (r) => <><span className="font-medium">{r.properties?.title}</span><span className="block text-xs text-stone-500">{r.properties?.ref} · {r.kind}</span></> },
          { key: "parties", header: "Parties", render: (r) => <span className="text-xs">{r.transaction_parties?.map((p: Row) => `${p.customers?.full_name} (${p.role})`).join(", ") || "—"}</span> },
          { key: "agreed_price", header: "Price", className: "whitespace-nowrap", render: (r) => money(r.agreed_price, r.currency) },
          { key: "status_id", header: "Status", render: (r) => <Badge tone="blue">{nameOf(l?.txStatuses, r.status_id)}</Badge> },
          { key: "approval_status", header: "Approval", render: (r) => r.approval_status === "not_required" ? "—" : <Badge status={r.approval_status} /> },
          { key: "agent_id", header: "Agent", render: (r) => nameOf(l?.staff, r.agent_id, "id", "full_name") },
          { key: "transaction_date", header: "Date", className: "whitespace-nowrap text-stone-500", render: (r) => date(r.transaction_date) },
        ]} />
      </Card>
      {creating && <NewTransaction leadId={get("lead")} propertyId={get("property")} onClose={() => { setCreating(false); set("new", ""); }} onCreated={(id) => navigate(`/admin/transactions/${id}`)} />}
    </>
  );
}

function NewTransaction({ leadId, propertyId, onClose, onCreated }: { leadId?: string; propertyId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const l = useLookups();
  const act = useAction();
  const [property, setProperty] = useState<Row | null>(null);
  const [buyer, setBuyer] = useState<Row | null>(null);
  const [seller, setSeller] = useState<Row | null>(null);
  const [deals, setDeals] = useState<Row[]>([]);

  useEffect(() => {
    if (propertyId) supabase.from("properties").select("id, ref, title, price, currency").eq("id", propertyId).single().then(({ data }) => data && setProperty(data));
  }, [propertyId]);
  useEffect(() => {
    if (!property) return setDeals([]);
    supabase.rpc("property_open_deals", { p_property: property.id }).then(({ data }) => setDeals((data as Row[]) ?? []));
  }, [property]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!property) return act.setError("Choose the property");
    const v = formValues(e.currentTarget);
    await act.run(async () => {
      const tx = await q<Row>(supabase.from("transactions").insert({
        kind: v.kind, property_id: property.id, lead_id: leadId || null, status_id: Number(v.status_id),
        transaction_date: v.transaction_date, agreed_price: v.agreed_price ? Number(v.agreed_price) : null,
        deposit: v.deposit ? Number(v.deposit) : null, currency: v.currency, payment_terms: v.payment_terms, notes: v.notes,
      }).select("id").single());
      const parties = [buyer && { transaction_id: tx.id, customer_id: buyer.id, role: "buyer" }, seller && { transaction_id: tx.id, customer_id: seller.id, role: "seller" }].filter(Boolean) as Row[];
      if (parties.length) await q(supabase.from("transaction_parties").insert(parties));
      onCreated(tx.id);
    });
  }

  return (
    <Modal title="New transaction" open onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Property" className="sm:col-span-2">
          {propertyId && !property ? <Input disabled value="Loading…" /> : <RecordPicker table="properties" initial={property} onPick={setProperty} />}
        </Field>
        {deals.length > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
            This property already has open deals: {deals.map((d) => `${d.ref} (${d.status})`).join(", ")}. Make sure this isn't a conflicting transaction.
          </p>
        )}
        <Field label="Type"><Select name="kind" defaultValue="sale"><option value="sale">Sale</option><option value="purchase">Purchase (we are buying)</option></Select></Field>
        <Field label="Status"><Select name="status_id" defaultValue={l?.txStatuses.find((s) => s.slug === "negotiation")?.id}>{l?.txStatuses.filter((s) => s.slug !== "completed" && s.slug !== "cancelled").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Buyer"><RecordPicker table="customers" onPick={setBuyer} /></Field>
        <Field label="Seller"><RecordPicker table="customers" onPick={setSeller} /></Field>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <Field label="Agreed price"><Input name="agreed_price" type="number" min={0} defaultValue={property?.price ?? ""} key={property?.id} /></Field>
          <Field label="Currency"><Select name="currency" defaultValue="PKR">{l?.currencies.map((c) => <option key={c.code}>{c.code}</option>)}</Select></Field>
        </div>
        <Field label="Deposit / advance"><Input name="deposit" type="number" min={0} /></Field>
        <Field label="Transaction date"><Input name="transaction_date" type="date" defaultValue={today()} /></Field>
        <Field label="Payment terms" className="sm:col-span-2"><Textarea name="payment_terms" rows={2} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} /></Field>
        <div className="sm:col-span-2"><ErrorBox error={act.error} /><Button type="submit" busy={act.busy}>Create transaction</Button></div>
      </form>
    </Modal>
  );
}
