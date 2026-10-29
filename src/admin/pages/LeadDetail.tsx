import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { date, dateTime, money, nameOf, q, signedUrl, supabase, useLoad, useLookups, type Row } from "../lib";
import { Badge, Button, Card, DL, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, formValues, useAction } from "../ui";

export default function LeadDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const l = useLookups();
  const navigate = useNavigate();
  const act = useAction();
  const [lostOpen, setLostOpen] = useState(false);

  const { data: lead, error, reload } = useLoad(() =>
    q<Row>(supabase.from("leads").select("*, properties(id, ref, title), customers(id, ref, full_name)").eq("id", id!).single()), [id]);
  const dupes = useLoad(async () => lead
    ? (await q<Row[]>(supabase.rpc("find_possible_duplicates", { p_mobile: lead.mobile, p_email: lead.email }))).filter((d) => d.id !== lead.id)
    : [], [lead?.id]);

  if (!lead || !l) return error ? <ErrorBox error={error} /> : <Spinner />;

  const editable = can("leads.edit") || can("leads.assign");
  const update = (patch: Row) => act.run(() => q(supabase.from("leads").update(patch).eq("id", lead.id)), reload);
  const lostId = l.leadStatuses.find((s) => s.slug === "lost")?.id;
  const sub = lead.submission as Row | null;

  return (
    <>
      <PageHeader
        back={{ to: "/admin/leads", label: "Leads" }}
        title={lead.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{lead.ref} · {nameOf(l.sources, lead.source_id)} · received {dateTime(lead.created_at)}
          {lead.duplicate_of && <Link to={`/admin/leads/${lead.duplicate_of}`}><Badge tone="amber">Repeat enquiry — see earlier lead</Badge></Link>}</span>}
        actions={<>
          {lead.customer_id
            ? <Link to={`/admin/customers/${lead.customer_id}`} className="rounded-lg border border-stone-300 px-3.5 py-2 text-sm font-medium hover:bg-stone-50">Customer {lead.customers?.ref}</Link>
            : can("customers.edit") && <Button variant="secondary" busy={act.busy} onClick={() => act.run(async () => {
                const cid = await q<string>(supabase.rpc("convert_lead", { p_lead: lead.id }));
                navigate(`/admin/customers/${cid}`);
              })}>Convert to customer</Button>}
          {can("transactions.edit") && lead.property_id && (
            <Button variant="secondary" onClick={() => navigate(`/admin/transactions?new=1&lead=${lead.id}&property=${lead.property_id}`)}>Start transaction</Button>
          )}
        </>}
      />
      <ErrorBox error={act.error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card title="Pipeline">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Status">
                <Select value={lead.status_id} disabled={!editable || act.busy} onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v === lostId) setLostOpen(true); else update({ status_id: v });
                }}>
                  {l.leadStatuses.filter((s) => s.active || s.id === lead.status_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Assigned agent">
                <Select value={lead.assigned_to ?? ""} disabled={!can("leads.assign") || act.busy} onChange={(e) => update({ assigned_to: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {l.staff.filter((s) => s.active || s.id === lead.assigned_to).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={lead.priority} disabled={!editable || act.busy} onChange={(e) => update({ priority: e.target.value })}>
                  <option>low</option><option>medium</option><option>high</option>
                </Select>
              </Field>
              <Field label="Next follow-up">
                <Input type="datetime-local" disabled={!editable} defaultValue={lead.next_follow_up_at ? lead.next_follow_up_at.slice(0, 16) : ""}
                  onBlur={(e) => update({ next_follow_up_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </Field>
              <Field label="Last activity"><p className="py-2 text-sm">{dateTime(lead.last_activity_at)}</p></Field>
              {lead.lost_reason && <Field label="Lost reason"><p className="py-2 text-sm">{lead.lost_reason}</p></Field>}
            </div>
          </Card>

          <Activities leadId={lead.id} customerId={lead.customer_id} propertyId={lead.property_id} canAdd={can("leads.edit")} onChange={reload} />
        </div>

        <div className="space-y-6">
          <LeadInfo lead={lead} editable={can("leads.edit")} onSaved={reload} />
          {sub && (
            <Card title="Property submitted for sale / rent">
              <DL items={[
                ["Purpose", sub.purpose], ["Location", [sub.area, sub.city].filter(Boolean).join(", ")], ["Address", sub.address],
                ["Category", sub.category], ["Size", sub.size ? `${sub.size} ${sub.size_unit}` : null],
                ["Expected price", sub.expected_price ? money(sub.expected_price) : null], ["Best time to call", sub.contact_time],
              ]} />
              {Array.isArray(sub.photos) && sub.photos.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {sub.photos.map((p: string, i: number) => (
                    <button key={p} className="text-sm text-brand-700 underline" onClick={() => act.run(async () => window.open(await signedUrl("submissions", p), "_blank"))}>Photo {i + 1}</button>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-stone-500">Not published. Review it, then create a property record if you take it on.</p>
            </Card>
          )}
          {dupes.data && dupes.data.length > 0 && (
            <Card title="Possible duplicates">
              <ul className="space-y-1.5 text-sm">
                {dupes.data.map((d) => (
                  <li key={d.id}><Link className="text-brand-700 hover:underline" to={`/admin/${d.kind === "lead" ? "leads" : "customers"}/${d.id}`}>{d.ref} {d.name}</Link>
                    <span className="text-stone-500"> · {d.kind} · {date(d.created_at)}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Modal title="Mark lead as lost" open={lostOpen} onClose={() => setLostOpen(false)}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const reason = formValues(e.currentTarget).reason;
          if (await act.run(() => q(supabase.from("leads").update({ status_id: lostId, lost_reason: reason }).eq("id", lead.id)), reload)) setLostOpen(false);
        }} className="space-y-4">
          <Field label="Reason"><Select name="reason" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {["Price too high", "Bought or rented elsewhere", "Property no longer available", "Not responding", "Requirements changed", "Financing not available", "Other"].map((r) => <option key={r}>{r}</option>)}
          </Select></Field>
          <Button type="submit" variant="danger" busy={act.busy}>Mark as lost</Button>
        </form>
      </Modal>
    </>
  );
}

function LeadInfo({ lead, editable, onSaved }: { lead: Row; editable: boolean; onSaved: () => void }) {
  const l = useLookups();
  const act = useAction();
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <Card title="Contact and requirements" actions={editable && <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}>
        <DL items={[
          ["Mobile", <a className="text-brand-700" href={`tel:${lead.mobile}`}>{lead.mobile}</a>],
          ["Email", lead.email ? <a className="text-brand-700" href={`mailto:${lead.email}`}>{lead.email}</a> : null],
          ["Preferred contact", lead.preferred_contact], ["Enquiry", lead.inquiry_type],
          ["Lead type", nameOf(l?.partyCategories, lead.type_id)], ["Category", nameOf(l?.categories, lead.category_id)],
          ["Location", [lead.preferred_area, lead.preferred_city].filter(Boolean).join(", ") || null],
          ["Budget", lead.budget_min || lead.budget_max ? `${money(lead.budget_min)} – ${money(lead.budget_max)}` : null],
          ["Property", lead.properties ? <Link className="text-brand-700" to={`/admin/properties/${lead.properties.id}`}>{lead.properties.ref} {lead.properties.title}</Link> : null],
          ["Viewing date", lead.preferred_viewing_date ? date(lead.preferred_viewing_date) : null],
        ]} />
        {lead.requirement && <p className="mt-4 whitespace-pre-line rounded-lg bg-stone-50 p-3 text-sm text-stone-700">{lead.requirement}</p>}
        {lead.notes && <p className="mt-3 whitespace-pre-line text-sm text-stone-600"><span className="font-medium">Notes:</span> {lead.notes}</p>}
      </Card>
    );
  }

  return (
    <Card title="Edit contact and requirements">
      <form className="grid gap-3" onSubmit={async (e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        const ok = await act.run(() => q(supabase.from("leads").update({
          name: v.name, mobile: v.mobile, email: v.email, preferred_contact: v.preferred_contact,
          type_id: v.type_id ? Number(v.type_id) : null, category_id: v.category_id ? Number(v.category_id) : null,
          preferred_city: v.preferred_city, preferred_area: v.preferred_area,
          budget_min: v.budget_min ? Number(v.budget_min) : null, budget_max: v.budget_max ? Number(v.budget_max) : null,
          requirement: v.requirement, notes: v.notes,
        }).eq("id", lead.id)), onSaved);
        if (ok) setEditing(false);
      }}>
        <Field label="Name"><Input name="name" required defaultValue={lead.name} /></Field>
        <Field label="Mobile"><Input name="mobile" required defaultValue={lead.mobile} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={lead.email ?? ""} /></Field>
        <Field label="Preferred contact"><Select name="preferred_contact" defaultValue={lead.preferred_contact ?? ""}><option value="">—</option><option>phone</option><option>whatsapp</option><option>email</option></Select></Field>
        <Field label="Lead type"><Select name="type_id" defaultValue={lead.type_id ?? ""}><option value="">—</option>{l?.partyCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Category"><Select name="category_id" defaultValue={lead.category_id ?? ""}><option value="">Any</option>{l?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="City"><Input name="preferred_city" defaultValue={lead.preferred_city ?? ""} /></Field>
          <Field label="Area"><Input name="preferred_area" defaultValue={lead.preferred_area ?? ""} /></Field>
          <Field label="Budget from"><Input name="budget_min" type="number" defaultValue={lead.budget_min ?? ""} /></Field>
          <Field label="Budget to"><Input name="budget_max" type="number" defaultValue={lead.budget_max ?? ""} /></Field>
        </div>
        <Field label="Requirements"><Textarea name="requirement" defaultValue={lead.requirement ?? ""} /></Field>
        <Field label="Negotiation / internal notes"><Textarea name="notes" defaultValue={lead.notes ?? ""} /></Field>
        <ErrorBox error={act.error} />
        <div className="flex gap-2"><Button type="submit" busy={act.busy}>Save</Button><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div>
      </form>
    </Card>
  );
}

const kinds = ["call", "whatsapp", "email", "meeting", "visit", "negotiation", "task", "note"];

export function Activities({ leadId, customerId, propertyId, canAdd, onChange }: { leadId?: string; customerId?: string | null; propertyId?: string | null; canAdd: boolean; onChange?: () => void }) {
  const l = useLookups();
  const { staff } = useAuth();
  const act = useAction();
  const [scheduled, setScheduled] = useState(false);
  const { data, reload } = useLoad(async () => {
    let query = supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(200);
    query = leadId ? query.eq("lead_id", leadId) : query.eq("customer_id", customerId!);
    return q<Row[]>(query);
  }, [leadId, customerId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    const ok = await act.run(() => q(supabase.from("activities").insert({
      lead_id: leadId ?? null, customer_id: customerId ?? null, property_id: propertyId ?? null,
      kind: v.kind, subject: v.subject, notes: v.notes, outcome: v.outcome,
      due_at: scheduled && v.due_at ? new Date(v.due_at).toISOString() : null,
      completed_at: scheduled ? null : new Date().toISOString(),
      assigned_to: v.assigned_to ?? staff!.id,
    })), () => { reload(); onChange?.(); });
    if (ok) form.reset();
  }

  async function complete(a: Row) {
    const outcome = window.prompt("Outcome (optional)") ?? undefined;
    await act.run(() => q(supabase.from("activities").update({ completed_at: new Date().toISOString(), outcome: outcome || a.outcome }).eq("id", a.id)), reload);
  }

  const open = data?.filter((a) => !a.completed_at && a.due_at) ?? [];
  const done = data?.filter((a) => a.completed_at || !a.due_at) ?? [];

  return (
    <Card title="Activity and follow-ups">
      {canAdd && (
        <form onSubmit={onSubmit} className="mb-6 grid gap-3 rounded-lg bg-stone-50 p-4 sm:grid-cols-4">
          <div className="flex gap-1 sm:col-span-4">
            <button type="button" onClick={() => setScheduled(false)} className={`rounded-md px-3 py-1 text-sm ${!scheduled ? "bg-white font-medium shadow-sm" : "text-stone-600"}`}>Log interaction</button>
            <button type="button" onClick={() => setScheduled(true)} className={`rounded-md px-3 py-1 text-sm ${scheduled ? "bg-white font-medium shadow-sm" : "text-stone-600"}`}>Schedule follow-up / visit</button>
          </div>
          <Select name="kind" defaultValue={scheduled ? "call" : "call"}>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</Select>
          <Input name="subject" required placeholder={scheduled ? "What needs doing" : "Summary"} className="sm:col-span-3" />
          {scheduled ? (
            <>
              <Input name="due_at" type="datetime-local" required className="sm:col-span-2" />
              <Select name="assigned_to" defaultValue={staff!.id} className="sm:col-span-2">
                {l?.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </Select>
            </>
          ) : (
            <Input name="outcome" placeholder="Outcome (e.g. interested, call back next week)" className="sm:col-span-4" />
          )}
          <Textarea name="notes" placeholder="Notes" rows={2} className="sm:col-span-4" />
          <div className="sm:col-span-4"><ErrorBox error={act.error} /><Button type="submit" busy={act.busy}>{scheduled ? "Schedule" : "Save"}</Button></div>
        </form>
      )}

      {open.length > 0 && (
        <>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Scheduled</p>
          <ul className="mb-6 space-y-2">
            {open.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3">
                <div>
                  <p className="text-sm font-medium">{a.subject} <Badge tone="blue">{a.kind}</Badge></p>
                  <p className={`text-xs ${new Date(a.due_at) < new Date() ? "text-red-600" : "text-stone-500"}`}>Due {dateTime(a.due_at)} · {nameOf(l?.staff, a.assigned_to, "id", "full_name")}</p>
                  {a.notes && <p className="mt-1 text-sm text-stone-600">{a.notes}</p>}
                </div>
                <Button variant="secondary" onClick={() => complete(a)}>Done</Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {data === null ? <Spinner /> : done.length === 0 ? <p className="text-sm text-stone-500">No interactions recorded yet.</p> : (
        <ol className="relative space-y-4 border-l border-stone-200 pl-5">
          {done.map((a) => (
            <li key={a.id}>
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
              <p className="text-sm"><span className="font-medium">{a.subject}</span> <Badge>{a.kind}</Badge></p>
              <p className="text-xs text-stone-500">{dateTime(a.completed_at ?? a.created_at)} · {nameOf(l?.staff, a.assigned_to ?? a.created_by, "id", "full_name")}</p>
              {a.outcome && <p className="mt-1 text-sm text-stone-700"><span className="font-medium">Outcome:</span> {a.outcome}</p>}
              {a.notes && <p className="mt-1 whitespace-pre-line text-sm text-stone-600">{a.notes}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
