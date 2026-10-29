import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { useAuth } from "../auth";
import { date, money, nameOf, q, supabase, useLoad, useLookups, type Row } from "../lib";
import { exportPdf } from "../export";
import { Badge, Button, Card, DL, ErrorBox, PageHeader, Spinner, Table, useAction } from "../ui";
import { CustomerForm } from "./CustomerList";
import { Activities } from "./LeadDetail";

export default function CustomerDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const l = useLookups();
  const navigate = useNavigate();
  const act = useAction();
  const [editing, setEditing] = useState(false);

  const { data: c, error, reload } = useLoad(() =>
    q<Row>(supabase.from("customers").select("*, customer_categories(category_id)").eq("id", id!).single()), [id]);
  const leads = useLoad(() => q<Row[]>(supabase.from("leads").select("id, ref, inquiry_type, status_id, created_at, properties(ref, title)").eq("customer_id", id!).order("created_at", { ascending: false })), [id]);
  const owned = useLoad(() => q<Row[]>(supabase.from("properties").select("id, ref, title, availability, publication").eq("owner_id", id!)), [id]);
  const txs = useLoad(async () => can("transactions.view") || can("transactions.view_own")
    ? q<Row[]>(supabase.from("transaction_parties").select("role, transactions(id, ref, kind, agreed_price, currency, status_id, properties(ref, title))").eq("customer_id", id!)) : ([] as Row[]), [id]);
  const contracts = useLoad(async () => can("contracts.view") || can("contracts.view_own")
    ? q<Row[]>(supabase.from("contract_parties").select("role, contracts(id, ref, status, start_date, end_date, type_id, properties(ref, title))").eq("customer_id", id!)) : ([] as Row[]), [id]);
  const schedules = useLoad(async () => can("payments.view")
    ? q<Row[]>(supabase.from("schedule_balances").select("*").eq("customer_id", id!)) : ([] as Row[]), [id]);
  const payments = useLoad(async () => can("payments.view")
    ? q<Row[]>(supabase.from("payment_receipts").select("*").eq("customer_id", id!).order("paid_on")) : ([] as Row[]), [id]);

  if (!c || !l) return error ? <ErrorBox error={error} /> : <Spinner />;

  function printStatement() {
    const rows = (payments.data ?? []).map((p) => ({ ...p, status: p.voided_at ? `Reversed (${p.void_type})` : "Received" }));
    const totals = (schedules.data ?? []).map((s) => `${s.ref}: paid ${money(s.paid, s.currency)}, outstanding ${money(s.outstanding, s.currency)}`).join(" · ");
    exportPdf(`Payment statement — ${c!.full_name} (${c!.ref})`, [
      { key: "paid_on", header: "Date", value: (r) => date(r.paid_on as string) },
      { key: "receipt_no", header: "Receipt" },
      { key: "property_refs", header: "Property" },
      { key: "schedule_refs", header: "Schedule" },
      { key: "installments", header: "Applied to" },
      { key: "method", header: "Method" },
      { key: "amount", header: "Amount", value: (r) => money(r.amount as number, r.currency as string) },
      { key: "status", header: "Status" },
    ], rows, totals);
  }

  return (
    <>
      <PageHeader
        back={{ to: "/admin/customers", label: "Customers" }}
        title={c.full_name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{c.ref}
          {c.customer_categories?.map((x: Row) => <Badge key={x.category_id}>{nameOf(l.partyCategories, x.category_id)}</Badge>)}
          {c.possible_duplicate_of && <Link to={`/admin/customers/${c.possible_duplicate_of}`}><Badge tone="amber">Possible duplicate of an earlier customer</Badge></Link>}</span>}
        actions={<>
          {can("payments.view") && <Button variant="secondary" onClick={printStatement}><Printer size={16} /> Payment statement</Button>}
          {can("customers.edit") && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
          {can("records.delete") && <Button variant="ghost" className="text-red-600" busy={act.busy} onClick={() => {
            if (window.confirm(`Delete ${c.full_name}? Customers linked to deals, contracts or payments cannot be deleted.`))
              act.run(() => q(supabase.from("customers").delete().eq("id", c.id)), () => navigate("/admin/customers"));
          }}>Delete</Button>}
        </>}
      />
      <ErrorBox error={act.error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {can("payments.view") && (
            <Card title="Payment schedules">
              <Table rows={schedules.data} empty="No payment schedules." onRowClick={(r) => navigate(`/admin/payments/${r.id}`)} columns={[
                { key: "ref", header: "Schedule", render: (r) => <><span className="font-medium">{r.ref}</span><span className="block text-xs text-stone-500">{r.title}</span></> },
                { key: "total", header: "Total", render: (r) => money(r.total, r.currency) },
                { key: "paid", header: "Paid", render: (r) => money(r.paid, r.currency) },
                { key: "outstanding", header: "Outstanding", render: (r) => <span className={r.overdue > 0 ? "font-medium text-red-600" : ""}>{money(r.outstanding, r.currency)}</span> },
                { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
              ]} />
            </Card>
          )}
          {(can("transactions.view") || can("transactions.view_own")) && (
            <Card title="Sales and purchases">
              <Table rows={txs.data?.filter((t) => t.transactions)} empty="None." rowKey="role" onRowClick={(r) => navigate(`/admin/transactions/${r.transactions.id}`)} columns={[
                { key: "ref", header: "Ref", render: (r) => r.transactions.ref },
                { key: "role", header: "Role", render: (r) => r.role },
                { key: "property", header: "Property", render: (r) => `${r.transactions.properties?.ref} ${r.transactions.properties?.title}` },
                { key: "price", header: "Price", render: (r) => money(r.transactions.agreed_price, r.transactions.currency) },
                { key: "status", header: "Status", render: (r) => nameOf(l.txStatuses, r.transactions.status_id) },
              ]} />
            </Card>
          )}
          {(can("contracts.view") || can("contracts.view_own")) && (
            <Card title="Contracts">
              <Table rows={contracts.data?.filter((t) => t.contracts)} empty="None." rowKey="role" onRowClick={(r) => navigate(`/admin/contracts/${r.contracts.id}`)} columns={[
                { key: "ref", header: "Ref", render: (r) => r.contracts.ref },
                { key: "type", header: "Type", render: (r) => nameOf(l.contractTypes, r.contracts.type_id) },
                { key: "role", header: "Role", render: (r) => r.role },
                { key: "property", header: "Property", render: (r) => `${r.contracts.properties?.ref} ${r.contracts.properties?.title}` },
                { key: "dates", header: "Period", render: (r) => `${date(r.contracts.start_date)} – ${date(r.contracts.end_date)}` },
                { key: "status", header: "Status", render: (r) => <Badge status={r.contracts.status} /> },
              ]} />
            </Card>
          )}
          <Activities customerId={c.id} canAdd={can("customers.edit") || can("leads.edit")} />
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <DL items={[
              ["Mobile", c.mobile ? <a className="text-brand-700" href={`tel:${c.mobile}`}>{c.mobile}</a> : null],
              ["Email", c.email], ["CNIC", c.cnic], ["Address", c.address], ["Added", date(c.created_at)],
            ]} />
            {c.notes && <p className="mt-4 whitespace-pre-line text-sm text-stone-600">{c.notes}</p>}
          </Card>
          <Card title="Leads and enquiries">
            {leads.data?.length === 0 && <p className="text-sm text-stone-500">None.</p>}
            <ul className="space-y-2 text-sm">
              {leads.data?.map((x) => (
                <li key={x.id}><Link className="text-brand-700 hover:underline" to={`/admin/leads/${x.id}`}>{x.ref}</Link>
                  <span className="text-stone-500"> · {x.inquiry_type} · {nameOf(l.leadStatuses, x.status_id)} · {date(x.created_at)}</span>
                  {x.properties && <span className="block text-xs text-stone-500">{x.properties.ref} {x.properties.title}</span>}</li>
              ))}
            </ul>
          </Card>
          {(owned.data?.length ?? 0) > 0 && (
            <Card title="Properties owned">
              <ul className="space-y-2 text-sm">
                {owned.data!.map((p) => <li key={p.id}><Link className="text-brand-700 hover:underline" to={`/admin/properties/${p.id}`}>{p.ref} {p.title}</Link> <Badge status={p.availability} /></li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {editing && <CustomerForm open customer={c} onClose={() => setEditing(false)} onSaved={reload} />}
    </>
  );
}
