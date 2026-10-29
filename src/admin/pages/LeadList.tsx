import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../auth";
import { date, dateTime, nameOf, q, supabase, useLoad, useLookups, type Row } from "../lib";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Table, Textarea, formValues, useAction } from "../ui";

export default function LeadList() {
  const { can, staff } = useAuth();
  const l = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const get = (k: string) => params.get(k) ?? "";
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  const { data, error } = useLoad(async () => {
    if (!l) return null;
    let query = supabase.from("leads")
      .select("id, ref, name, mobile, inquiry_type, status_id, priority, assigned_to, source_id, next_follow_up_at, last_activity_at, created_at, duplicate_of, properties(ref, title)")
      .order("created_at", { ascending: false }).limit(500);
    if (get("status")) query = query.eq("status_id", Number(get("status")));
    else if (get("stage") === "negotiation") query = query.in("status_id", l.leadStatuses.filter((s) => ["negotiation", "offer", "contract-preparation"].includes(s.slug)).map((s) => s.id));
    else if (!get("closed")) query = query.in("status_id", l.leadStatuses.filter((s) => !s.is_closed).map((s) => s.id));
    if (get("source")) query = query.eq("source_id", Number(get("source")));
    if (get("assigned") === "none") query = query.is("assigned_to", null);
    else if (get("assigned") === "me") query = query.eq("assigned_to", staff!.id);
    else if (get("assigned")) query = query.eq("assigned_to", get("assigned"));
    if (get("followup") === "due") query = query.lte("next_follow_up_at", new Date().toISOString());
    if (get("type")) query = query.eq("inquiry_type", get("type"));
    if (get("q")) {
      const t = get("q").replace(/[%,()]/g, " ");
      query = query.or(`name.ilike.%${t}%,mobile.ilike.%${t}%,ref.ilike.%${t}%,email.ilike.%${t}%`);
    }
    return q<Row[]>(query);
  }, [params.toString(), l]);

  return (
    <>
      <PageHeader title="Leads" subtitle="Website enquiries, viewing requests, property submissions and leads added by staff."
        actions={can("leads.edit") && <Button onClick={() => setCreating(true)}><Plus size={16} /> Add lead</Button>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Input placeholder="Name, mobile, ref" defaultValue={get("q")} onKeyDown={(e) => e.key === "Enter" && set("q", e.currentTarget.value)} onBlur={(e) => set("q", e.target.value)} />
          <Select value={get("status")} onChange={(e) => set("status", e.target.value)}>
            <option value="">Open statuses</option>
            {l?.leadStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={get("assigned")} onChange={(e) => set("assigned", e.target.value)}>
            <option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>
            {can("leads.view_all") && l?.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
          <Select value={get("source")} onChange={(e) => set("source", e.target.value)}>
            <option value="">All sources</option>
            {l?.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={get("type")} onChange={(e) => set("type", e.target.value)}>
            <option value="">All enquiry types</option>
            {["buy", "rent", "sell", "viewing", "general"].map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select value={get("followup")} onChange={(e) => set("followup", e.target.value)}>
            <option value="">Any follow-up</option><option value="due">Follow-up due</option>
          </Select>
        </div>
        <ErrorBox error={error} />
        <Table rows={data} onRowClick={(r) => navigate(`/admin/leads/${r.id}`)} empty="No leads match these filters." columns={[
          { key: "ref", header: "Ref", className: "whitespace-nowrap text-stone-500" },
          { key: "name", header: "Name", render: (r) => <><span className="font-medium text-stone-900">{r.name}</span>{r.duplicate_of && <span className="ml-2"><Badge tone="amber">Repeat</Badge></span>}<span className="block text-xs text-stone-500">{r.mobile}</span></> },
          { key: "inquiry_type", header: "Enquiry", render: (r) => <>{r.inquiry_type}<span className="block text-xs text-stone-500">{r.properties ? `${r.properties.ref} ${r.properties.title}` : nameOf(l?.sources, r.source_id)}</span></> },
          { key: "status_id", header: "Status", render: (r) => <Badge tone={l?.leadStatuses.find((s) => s.id === r.status_id)?.is_won ? "green" : "blue"}>{nameOf(l?.leadStatuses, r.status_id)}</Badge> },
          { key: "priority", header: "Priority", render: (r) => <Badge status={r.priority} /> },
          { key: "assigned_to", header: "Agent", render: (r) => r.assigned_to ? nameOf(l?.staff, r.assigned_to, "id", "full_name") : <Badge tone="amber">Unassigned</Badge> },
          { key: "next_follow_up_at", header: "Next follow-up", className: "whitespace-nowrap", render: (r) => r.next_follow_up_at ? <span className={new Date(r.next_follow_up_at) < new Date() ? "text-red-600" : ""}>{dateTime(r.next_follow_up_at)}</span> : "—" },
          { key: "created_at", header: "Received", className: "whitespace-nowrap text-stone-500", render: (r) => date(r.created_at) },
        ]} />
      </Card>
      <NewLead open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/admin/leads/${id}`)} />
    </>
  );
}

function NewLead({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const l = useLookups();
  const { can } = useAuth();
  const act = useAction();
  const [dupes, setDupes] = useState<Row[] | null>(null);

  async function checkDupes(mobile: string) {
    if (mobile.replace(/\D/g, "").length < 10) return setDupes(null);
    const { data } = await supabase.rpc("find_possible_duplicates", { p_mobile: mobile });
    setDupes((data as Row[]) ?? []);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    await act.run(async () => {
      const row = await q<Row>(supabase.from("leads").insert({
        name: v.name, mobile: v.mobile, email: v.email, inquiry_type: v.inquiry_type, requirement: v.requirement,
        preferred_city: v.preferred_city, preferred_area: v.preferred_area,
        category_id: v.category_id ? Number(v.category_id) : null, type_id: v.type_id ? Number(v.type_id) : null,
        budget_min: v.budget_min ? Number(v.budget_min) : null, budget_max: v.budget_max ? Number(v.budget_max) : null,
        source_id: Number(v.source_id), status_id: l!.leadStatuses.find((s) => s.slug === "new")!.id,
        priority: v.priority, assigned_to: v.assigned_to,
      }).select("id").single());
      onCreated(row.id);
    });
  }

  return (
    <Modal title="Add lead" open={open} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input name="name" required /></Field>
        <Field label="Mobile"><Input name="mobile" required onBlur={(e) => checkDupes(e.target.value)} /></Field>
        {dupes && dupes.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
            Possible existing records with this number:{" "}
            {dupes.map((d) => <a key={d.id} className="mr-2 underline" href={`/admin/${d.kind === "lead" ? "leads" : "customers"}/${d.id}`} target="_blank" rel="noreferrer">{d.ref} {d.name}</a>)}
          </div>
        )}
        <Field label="Email"><Input name="email" type="email" /></Field>
        <Field label="Source">
          <Select name="source_id" required defaultValue={l?.sources.find((s) => s.slug === "phone")?.id}>
            {l?.sources.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Enquiry">
          <Select name="inquiry_type" defaultValue="buy">{["buy", "rent", "sell", "viewing", "general"].map((t) => <option key={t}>{t}</option>)}</Select>
        </Field>
        <Field label="Lead type">
          <Select name="type_id"><option value="">—</option>{l?.partyCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label="Property category">
          <Select name="category_id"><option value="">Any</option>{l?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label="Priority"><Select name="priority" defaultValue="medium"><option>low</option><option>medium</option><option>high</option></Select></Field>
        <Field label="Preferred city"><Input name="preferred_city" /></Field>
        <Field label="Preferred area"><Input name="preferred_area" /></Field>
        <Field label="Budget from (PKR)"><Input name="budget_min" type="number" min={0} /></Field>
        <Field label="Budget to (PKR)"><Input name="budget_max" type="number" min={0} /></Field>
        {can("leads.assign") && (
          <Field label="Assign to">
            <Select name="assigned_to"><option value="">Unassigned</option>{l?.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>
          </Field>
        )}
        <Field label="Requirements" className="sm:col-span-2"><Textarea name="requirement" /></Field>
        <div className="sm:col-span-2"><ErrorBox error={act.error} /><Button type="submit" busy={act.busy}>Create lead</Button></div>
      </form>
    </Modal>
  );
}
