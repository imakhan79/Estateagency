import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../auth";
import { date, nameOf, q, supabase, useLoad, useLookups, type Row } from "../lib";
import { RecordPicker } from "../pickers";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Table, Tabs, Textarea, formValues, useAction } from "../ui";

export default function ContractList() {
  const { can } = useAuth();
  const l = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "all";
  const [creating, setCreating] = useState(params.get("new") === "1");
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  const all = useLoad(async () => {
    if (tab !== "all") return null;
    let query = supabase.from("contracts")
      .select("id, ref, type_id, status, start_date, end_date, responsible_id, renewal_status, properties(ref, title), contract_parties(role, customers(full_name))")
      .order("created_at", { ascending: false }).limit(500);
    if (params.get("status")) query = query.eq("status", params.get("status")!);
    if (params.get("type")) query = query.eq("type_id", Number(params.get("type")));
    return q<Row[]>(query);
  }, [params.toString()]);

  const days = Number(params.get("days") ?? 90);
  const renewals = useLoad(async () => tab === "renewals"
    ? q<Row[]>(supabase.from("contract_renewals").select("*").lte("days_remaining", days).order("end_date")) : null, [tab, days]);

  return (
    <>
      <PageHeader title="Contracts" subtitle="Sales, purchase, rental and lease agreements with their documents and renewals."
        actions={can("contracts.edit") && <Button onClick={() => setCreating(true)}><Plus size={16} /> New contract</Button>} />
      <Tabs value={tab} onChange={(k) => set("tab", k === "all" ? "" : k)} tabs={[{ key: "all", label: "All contracts" }, { key: "renewals", label: "Expiry and renewals" }]} />

      {tab === "all" ? (
        <Card>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Select value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
              <option value="">All statuses</option>
              {l?.contractStatuses.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </Select>
            <Select value={params.get("type") ?? ""} onChange={(e) => set("type", e.target.value)}>
              <option value="">All types</option>
              {l?.contractTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <ErrorBox error={all.error} />
          <Table rows={all.data} onRowClick={(r) => navigate(`/admin/contracts/${r.id}`)} empty="No contracts." columns={[
            { key: "ref", header: "Ref", className: "whitespace-nowrap text-stone-500" },
            { key: "type", header: "Type", render: (r) => nameOf(l?.contractTypes, r.type_id) },
            { key: "property", header: "Property", render: (r) => <><span className="font-medium">{r.properties?.title}</span><span className="block text-xs text-stone-500">{r.properties?.ref}</span></> },
            { key: "parties", header: "Parties", render: (r) => <span className="text-xs">{r.contract_parties?.map((p: Row) => `${p.customers?.full_name} (${p.role})`).join(", ") || "—"}</span> },
            { key: "period", header: "Period", className: "whitespace-nowrap", render: (r) => <>{date(r.start_date)}<span className="block text-xs text-stone-500">to {date(r.end_date)}</span></> },
            { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
            { key: "responsible_id", header: "Responsible", render: (r) => nameOf(l?.staff, r.responsible_id, "id", "full_name") },
          ]} />
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-stone-600">Ending within</span>
            <Select className="w-auto" value={days} onChange={(e) => set("days", e.target.value)}>
              {[7, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
            </Select>
            <span className="text-sm text-stone-500">(includes contracts already expired)</span>
          </div>
          <Table rows={renewals.data} onRowClick={(r) => navigate(`/admin/contracts/${r.id}`)} empty="No contracts ending in this period." columns={[
            { key: "ref", header: "Contract", className: "whitespace-nowrap" },
            { key: "property_title", header: "Property", render: (r) => <>{r.property_title}<span className="block text-xs text-stone-500">{r.property_ref}</span></> },
            { key: "tenants", header: "Tenant", render: (r) => r.tenants ?? "—" },
            { key: "end_date", header: "End date", className: "whitespace-nowrap", render: (r) => date(r.end_date) },
            { key: "days_remaining", header: "Days left", render: (r) => <span className={r.days_remaining < 0 ? "font-medium text-red-600" : r.days_remaining <= 30 ? "font-medium text-amber-700" : ""}>{r.days_remaining < 0 ? `Expired ${-r.days_remaining} days ago` : r.days_remaining}</span> },
            { key: "renewal_status", header: "Renewal", render: (r) => <Badge status={r.renewal_status ?? "not_contacted"} /> },
            { key: "responsible_id", header: "Responsible", render: (r) => nameOf(l?.staff, r.responsible_id, "id", "full_name") },
            { key: "next_action_date", header: "Next action", className: "whitespace-nowrap", render: (r) => date(r.next_action_date) },
          ]} />
        </Card>
      )}
      {creating && <NewContract transactionId={params.get("transaction") ?? undefined} onClose={() => { setCreating(false); set("new", ""); }} onCreated={(id) => navigate(`/admin/contracts/${id}`)} />}
    </>
  );
}

function NewContract({ transactionId, onClose, onCreated }: { transactionId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const l = useLookups();
  const act = useAction();
  const [tx, setTx] = useState<Row | null>(null);
  const [property, setProperty] = useState<Row | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [tenant, setTenant] = useState<Row | null>(null);
  const [landlord, setLandlord] = useState<Row | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    supabase.from("transactions").select("id, ref, kind, agreed_price, currency, payment_terms, property_id, properties(id, ref, title), transaction_parties(customer_id, role)")
      .eq("id", transactionId).single().then(({ data }) => {
        if (!data) return;
        setTx(data);
        setProperty(data.properties as unknown as Row);
      });
  }, [transactionId]);
  useEffect(() => {
    if (tx && l) setTypeId(l.contractTypes.find((t) => t.slug === tx.kind)?.id ?? null);
    else if (l && !typeId) setTypeId(l.contractTypes.find((t) => t.slug === "rental")?.id ?? null);
  }, [tx, l]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeSlug = l?.contractTypes.find((t) => t.id === typeId)?.slug;
  const isRental = typeSlug === "rental" || typeSlug === "lease";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!property) return act.setError("Choose the property");
    const v = formValues(e.currentTarget);
    await act.run(async () => {
      const c = await q<Row>(supabase.from("contracts").insert({
        type_id: typeId, property_id: property.id, transaction_id: tx?.id ?? null, title: v.title,
        start_date: v.start_date, end_date: v.end_date, value: v.value ? Number(v.value) : null, currency: v.currency ?? "PKR",
        payment_terms: v.payment_terms, renewal_terms: v.renewal_terms,
        rent_amount: isRental && v.rent_amount ? Number(v.rent_amount) : null,
        security_deposit: isRental && v.security_deposit ? Number(v.security_deposit) : null,
        advance_rent: isRental && v.advance_rent ? Number(v.advance_rent) : null,
        payment_frequency: isRental ? v.payment_frequency : null, payment_due_day: isRental && v.payment_due_day ? Number(v.payment_due_day) : null,
        renewal_status: isRental ? "not_contacted" : null,
      }).select("id").single());
      const parties: Row[] = [];
      if (tx) parties.push(...tx.transaction_parties.map((p: Row) => ({ contract_id: c.id, customer_id: p.customer_id, role: ["buyer", "seller"].includes(p.role) ? p.role : "other" })));
      if (isRental && tenant) parties.push({ contract_id: c.id, customer_id: tenant.id, role: "tenant" });
      if (isRental && landlord) parties.push({ contract_id: c.id, customer_id: landlord.id, role: "landlord" });
      if (parties.length) await q(supabase.from("contract_parties").upsert(parties, { ignoreDuplicates: true }));
      onCreated(c.id);
    });
  }

  return (
    <Modal title="New contract" open onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        {tx && <p className="rounded-lg bg-stone-50 p-3 text-sm sm:col-span-2">From transaction {tx.ref}. Its buyer and seller will be added as parties.</p>}
        <Field label="Type">
          <Select value={typeId ?? ""} onChange={(e) => setTypeId(Number(e.target.value))}>
            {l?.contractTypes.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Property">{transactionId && !property ? <Input disabled value="Loading…" /> : <RecordPicker table="properties" initial={property} onPick={setProperty} />}</Field>
        <Field label="Title (optional)" className="sm:col-span-2"><Input name="title" /></Field>
        {isRental && <>
          <Field label="Tenant"><RecordPicker table="customers" onPick={setTenant} /></Field>
          <Field label="Landlord / owner"><RecordPicker table="customers" onPick={setLandlord} /></Field>
        </>}
        <Field label="Start date"><Input name="start_date" type="date" required={isRental} /></Field>
        <Field label="End date"><Input name="end_date" type="date" required={isRental} /></Field>
        {isRental ? <>
          <Field label="Rent per month"><Input name="rent_amount" type="number" min={0} required /></Field>
          <Field label="Payment frequency">
            <Select name="payment_frequency" defaultValue="monthly">
              {["monthly", "quarterly", "semi_annual", "annual", "one_off"].map((f) => <option key={f} value={f}>{f.replace("_", "-")}</option>)}
            </Select>
          </Field>
          <Field label="Security deposit"><Input name="security_deposit" type="number" min={0} /></Field>
          <Field label="Advance rent"><Input name="advance_rent" type="number" min={0} /></Field>
          <Field label="Rent due on day of month" hint="1–28. Leave blank to use the start date."><Input name="payment_due_day" type="number" min={1} max={28} /></Field>
        </> : (
          <Field label="Contract value"><Input name="value" type="number" min={0} defaultValue={tx?.agreed_price ?? ""} /></Field>
        )}
        <Field label="Payment terms" className="sm:col-span-2"><Textarea name="payment_terms" rows={2} defaultValue={tx?.payment_terms ?? ""} /></Field>
        <Field label="Renewal terms" className="sm:col-span-2"><Textarea name="renewal_terms" rows={2} /></Field>
        <div className="sm:col-span-2"><ErrorBox error={act.error} /><Button type="submit" busy={act.busy}>Create draft contract</Button></div>
      </form>
    </Modal>
  );
}
