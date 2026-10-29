import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../auth";
import { date, q, supabase, useLoad, useLookups, type Row } from "../lib";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Table, Textarea, formValues, useAction } from "../ui";

export default function CustomerList() {
  const { can } = useAuth();
  const l = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const term = params.get("q") ?? "";
  const cat = params.get("category") ?? "";

  const { data, error } = useLoad(async () => {
    let query = supabase.from("customers")
      .select("id, ref, full_name, mobile, email, cnic, created_at, possible_duplicate_of, customer_categories" + (cat ? "!inner" : "") + "(category_id)")
      .order("created_at", { ascending: false }).limit(500);
    if (cat) query = query.eq("customer_categories.category_id", Number(cat));
    if (term) {
      const t = term.replace(/[%,()]/g, " ");
      query = query.or(`full_name.ilike.%${t}%,mobile.ilike.%${t}%,ref.ilike.%${t}%,email.ilike.%${t}%,cnic.ilike.%${t}%`);
    }
    return q<Row[]>(query);
  }, [term, cat]);

  const update = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  return (
    <>
      <PageHeader title="Customers" subtitle="Buyers, sellers, tenants, landlords and investors."
        actions={can("customers.edit") && <Button onClick={() => setCreating(true)}><Plus size={16} /> Add customer</Button>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Input placeholder="Name, mobile, CNIC, ref" defaultValue={term} onKeyDown={(e) => e.key === "Enter" && update("q", e.currentTarget.value)} onBlur={(e) => update("q", e.target.value)} />
          <Select value={cat} onChange={(e) => update("category", e.target.value)}>
            <option value="">All categories</option>
            {l?.partyCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <ErrorBox error={error} />
        <Table rows={data} onRowClick={(r) => navigate(`/admin/customers/${r.id}`)} columns={[
          { key: "ref", header: "Ref", className: "whitespace-nowrap text-stone-500" },
          { key: "full_name", header: "Name", render: (r) => <><span className="font-medium text-stone-900">{r.full_name}</span>{r.possible_duplicate_of && <span className="ml-2"><Badge tone="amber">Possible duplicate</Badge></span>}</> },
          { key: "mobile", header: "Contact", render: (r) => <>{r.mobile ?? "—"}<span className="block text-xs text-stone-500">{r.email}</span></> },
          { key: "cat", header: "Categories", render: (r) => <span className="flex flex-wrap gap-1">{r.customer_categories?.map((c: Row) => <Badge key={c.category_id}>{l?.partyCategories.find((p) => p.id === c.category_id)?.name}</Badge>)}</span> },
          { key: "created_at", header: "Added", className: "text-stone-500", render: (r) => date(r.created_at) },
        ]} />
      </Card>
      <CustomerForm open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/admin/customers/${id}`)} />
    </>
  );
}

export function CustomerForm({ open, onClose, onSaved, customer }: { open: boolean; onClose: () => void; onSaved: (id: string) => void; customer?: Row }) {
  const l = useLookups();
  const act = useAction();
  const [dupes, setDupes] = useState<Row[]>([]);
  const [cats, setCats] = useState<number[]>(customer?.customer_categories?.map((c: Row) => c.category_id) ?? []);

  async function check(form: HTMLFormElement) {
    const v = formValues(form);
    if (!v.mobile && !v.email && !v.cnic) return setDupes([]);
    const { data } = await supabase.rpc("find_possible_duplicates", { p_mobile: v.mobile ?? "", p_email: v.email, p_cnic: v.cnic });
    setDupes(((data as Row[]) ?? []).filter((d) => d.kind === "customer" && d.id !== customer?.id));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    await act.run(async () => {
      const row = { full_name: v.full_name, mobile: v.mobile, email: v.email, cnic: v.cnic, address: v.address, notes: v.notes };
      const saved = customer
        ? await q<Row>(supabase.from("customers").update(row).eq("id", customer.id).select("id").single())
        : await q<Row>(supabase.from("customers").insert(row).select("id").single());
      await q(supabase.from("customer_categories").delete().eq("customer_id", saved.id));
      if (cats.length) await q(supabase.from("customer_categories").insert(cats.map((c) => ({ customer_id: saved.id, category_id: c }))));
      onSaved(saved.id);
      onClose();
    });
  }

  return (
    <Modal title={customer ? "Edit customer" : "Add customer"} open={open} onClose={onClose} wide>
      <form onSubmit={onSubmit} onBlur={(e) => ["mobile", "email", "cnic"].includes((e.target as unknown as HTMLInputElement).name) && check(e.currentTarget)} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2"><Input name="full_name" required defaultValue={customer?.full_name} /></Field>
        <Field label="Mobile"><Input name="mobile" defaultValue={customer?.mobile ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={customer?.email ?? ""} /></Field>
        <Field label="CNIC"><Input name="cnic" placeholder="00000-0000000-0" defaultValue={customer?.cnic ?? ""} /></Field>
        <Field label="Address"><Input name="address" defaultValue={customer?.address ?? ""} /></Field>
        {dupes.length > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
            Existing customers with the same mobile, email or CNIC:{" "}
            {dupes.map((d) => <a key={d.id} className="mr-2 underline" href={`/admin/customers/${d.id}`} target="_blank" rel="noreferrer">{d.ref} {d.name}</a>)}
          </p>
        )}
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-stone-700">Categories</p>
          <div className="flex flex-wrap gap-2">
            {l?.partyCategories.filter((c) => c.active).map((c) => {
              const on = cats.includes(c.id);
              return <button type="button" key={c.id} onClick={() => setCats(on ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-stone-300 text-stone-600"}`}>{c.name}</button>;
            })}
          </div>
        </div>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={customer?.notes ?? ""} /></Field>
        <div className="sm:col-span-2"><ErrorBox error={act.error} /><Button type="submit" busy={act.busy}>Save customer</Button></div>
      </form>
    </Modal>
  );
}
