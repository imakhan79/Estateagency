import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileText, Upload } from "lucide-react";
import { useAuth } from "../auth";
import { date, dateTime, fileExt, label, money, nameOf, q, signedUrl, supabase, useLoad, useLookups, type Row } from "../lib";
import { RecordPicker } from "../pickers";
import { Badge, Button, Card, DL, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Textarea, formValues, useAction } from "../ui";

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png";

export default function ContractDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const l = useLookups();
  const navigate = useNavigate();
  const act = useAction();
  const [modal, setModal] = useState<null | "edit" | "renew" | "terminate">(null);

  const { data: c, error, reload } = useLoad(() =>
    q<Row>(supabase.from("contracts").select("*, properties(id, ref, title), transactions(id, ref), contract_parties(customer_id, role, customers(id, ref, full_name, mobile))").eq("id", id!).single()), [id]);
  const chain = useLoad(async () => {
    if (!c) return [];
    const [prev, next] = await Promise.all([
      c.previous_contract_id ? q<Row[]>(supabase.from("contracts").select("id, ref, status, start_date, end_date").eq("id", c.previous_contract_id)) : ([] as Row[]),
      q<Row[]>(supabase.from("contracts").select("id, ref, status, start_date, end_date").eq("previous_contract_id", c.id)),
    ]);
    return [...prev.map((r) => ({ ...r, rel: "Previous agreement" })), ...next.map((r) => ({ ...r, rel: "Renewed / amended by" }))] as Row[];
  }, [c?.id, c?.previous_contract_id]);
  const schedules = useLoad(async () => can("payments.view") ? q<Row[]>(supabase.from("schedule_balances").select("*").eq("contract_id", id!)) : ([] as Row[]), [id]);

  if (!c || !l) return error ? <ErrorBox error={error} /> : <Spinner />;

  const editable = can("contracts.edit");
  const typeSlug = l.contractTypes.find((t) => t.id === c.type_id)?.slug;
  const isRental = ["rental", "lease", "renewal"].includes(typeSlug ?? "");
  const nextStatuses = l.transitions.filter((t) => t.from_status === c.status).map((t) => t.to_status)
    .filter((s) => !["cancelled", "terminated"].includes(s) || can("contracts.cancel"))
    .filter((s) => s !== "renewed"); // renewals go through the Renew button so the new agreement is created
  const update = (patch: Row) => act.run(() => q(supabase.from("contracts").update(patch).eq("id", c.id)), reload);
  const days = c.end_date ? Math.round((new Date(c.end_date).getTime() - Date.now()) / 86400000) : null;

  return (
    <>
      <PageHeader
        back={{ to: "/admin/contracts", label: "Contracts" }}
        title={`${nameOf(l.contractTypes, c.type_id)} — ${c.properties.title}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">{c.ref} <Badge status={c.status} />{c.title && <span>{c.title}</span>}</span>}
        actions={<>
          {editable && nextStatuses.length > 0 && (
            <Select className="w-auto" value="" disabled={act.busy} onChange={(e) => {
              const s = e.target.value;
              if (s === "terminated") setModal("terminate"); else if (s) update({ status: s, ...(s === "active" && !c.signed_on ? { signed_on: new Date().toISOString().slice(0, 10) } : {}) });
            }}>
              <option value="">Change status…</option>
              {nextStatuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </Select>
          )}
          {editable && ["active", "expiring_soon", "expired"].includes(c.status) && <Button onClick={() => setModal("renew")}>Renew</Button>}
          {editable && <Button variant="secondary" onClick={() => setModal("edit")}>Edit</Button>}
          {can("payments.record") && isRental && ["active", "expiring_soon", "pending_signature", "draft"].includes(c.status) && (schedules.data?.length ?? 0) === 0 && (
            <Button variant="secondary" busy={act.busy} onClick={() => act.run(async () => navigate(`/admin/payments/${await q<string>(supabase.rpc("create_rent_schedule", { p_contract: c.id }))}`))}>Create rent schedule</Button>
          )}
        </>}
      />
      <ErrorBox error={act.error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title="Terms">
            <DL items={[
              ["Property", <Link className="text-brand-700" to={`/admin/properties/${c.properties.id}`}>{c.properties.ref} {c.properties.title}</Link>],
              ["Transaction", c.transactions ? <Link className="text-brand-700" to={`/admin/transactions/${c.transactions.id}`}>{c.transactions.ref}</Link> : null],
              ["Start", date(c.start_date)],
              ["End", c.end_date ? <>{date(c.end_date)}{days != null && ["active", "expiring_soon"].includes(c.status) && <span className={`ml-2 text-xs ${days <= 30 ? "text-amber-700" : "text-stone-500"}`}>({days} days left)</span>}</> : null],
              ["Signed on", date(c.signed_on)],
              isRental ? ["Rent", c.rent_amount ? `${money(c.rent_amount, c.currency)} per month, paid ${label(c.payment_frequency)}` : null] : ["Contract value", money(c.value, c.currency)],
              ...(isRental ? [["Security deposit", money(c.security_deposit, c.currency)], ["Advance rent", money(c.advance_rent, c.currency)], ["Rent due day", c.payment_due_day]] as [string, unknown][] : []),
              ["Responsible", nameOf(l.staff, c.responsible_id, "id", "full_name")],
            ] as [React.ReactNode, React.ReactNode][]} />
            {c.payment_terms && <p className="mt-4 whitespace-pre-line text-sm"><span className="font-medium">Payment terms:</span> {c.payment_terms}</p>}
            {c.renewal_terms && <p className="mt-2 whitespace-pre-line text-sm"><span className="font-medium">Renewal terms:</span> {c.renewal_terms}</p>}
            {c.terminated_on && <p className="mt-2 text-sm text-red-700">Terminated {date(c.terminated_on)}: {c.termination_reason}</p>}
            {c.notes && <p className="mt-2 whitespace-pre-line text-sm text-stone-600">{c.notes}</p>}
          </Card>

          {isRental && c.end_date && (
            <Card title="Renewal">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Renewal status">
                  <Select value={c.renewal_status ?? "not_contacted"} disabled={!editable || act.busy} onChange={(e) => update({ renewal_status: e.target.value })}>
                    {["not_contacted", "discussion", "proposed", "renewed", "not_renewing", "terminating", "expired"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </Select>
                </Field>
                <Field label="Next action date" hint="You'll get a reminder on this date.">
                  <Input type="date" disabled={!editable} defaultValue={c.next_action_date ?? ""} onBlur={(e) => e.target.value !== (c.next_action_date ?? "") && update({ next_action_date: e.target.value || null })} />
                </Field>
              </div>
            </Card>
          )}

          <DocumentsCard contractId={c.id} editable={editable} />

          {can("payments.view") && (
            <Card title="Payment schedules">
              <Table rows={schedules.data} empty="No payment schedule." onRowClick={(r) => navigate(`/admin/payments/${r.id}`)} columns={[
                { key: "ref", header: "Schedule", render: (r) => <><span className="font-medium">{r.ref}</span><span className="block text-xs text-stone-500">{r.title}</span></> },
                { key: "total", header: "Total", render: (r) => money(r.total, r.currency) },
                { key: "outstanding", header: "Outstanding", render: (r) => money(r.outstanding, r.currency) },
                { key: "next_due_date", header: "Next due", render: (r) => date(r.next_due_date) },
                { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
              ]} />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <PartiesCard c={c} editable={editable} onChange={reload} />
          {(chain.data?.length ?? 0) > 0 && (
            <Card title="Agreement history">
              <ul className="space-y-2 text-sm">
                {chain.data!.map((x) => (
                  <li key={x.id}><span className="text-stone-500">{x.rel}: </span><Link className="text-brand-700 hover:underline" to={`/admin/contracts/${x.id}`}>{x.ref}</Link> <Badge status={x.status} />
                    <span className="block text-xs text-stone-500">{date(x.start_date)} – {date(x.end_date)}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Modal title="Edit contract" open={modal === "edit"} onClose={() => setModal(null)} wide>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          const num = (k: string) => (v[k] ? Number(v[k]) : null);
          if (await act.run(() => q(supabase.from("contracts").update({
            title: v.title, start_date: v.start_date, end_date: v.end_date, signed_on: v.signed_on, value: num("value"),
            rent_amount: num("rent_amount"), security_deposit: num("security_deposit"), advance_rent: num("advance_rent"),
            payment_frequency: isRental ? v.payment_frequency : null, payment_due_day: num("payment_due_day"),
            payment_terms: v.payment_terms, renewal_terms: v.renewal_terms, responsible_id: v.responsible_id, notes: v.notes,
          }).eq("id", c.id)), reload)) setModal(null);
        }}>
          <Field label="Title" className="sm:col-span-2"><Input name="title" defaultValue={c.title ?? ""} /></Field>
          <Field label="Start date"><Input name="start_date" type="date" defaultValue={c.start_date ?? ""} /></Field>
          <Field label="End date"><Input name="end_date" type="date" defaultValue={c.end_date ?? ""} /></Field>
          <Field label="Signed on"><Input name="signed_on" type="date" defaultValue={c.signed_on ?? ""} /></Field>
          <Field label="Responsible"><Select name="responsible_id" defaultValue={c.responsible_id ?? ""}>{l.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
          {isRental ? <>
            <Field label="Rent per month"><Input name="rent_amount" type="number" defaultValue={c.rent_amount ?? ""} /></Field>
            <Field label="Frequency"><Select name="payment_frequency" defaultValue={c.payment_frequency ?? "monthly"}>{["monthly", "quarterly", "semi_annual", "annual", "one_off"].map((f) => <option key={f} value={f}>{label(f)}</option>)}</Select></Field>
            <Field label="Security deposit"><Input name="security_deposit" type="number" defaultValue={c.security_deposit ?? ""} /></Field>
            <Field label="Advance rent"><Input name="advance_rent" type="number" defaultValue={c.advance_rent ?? ""} /></Field>
            <Field label="Due day"><Input name="payment_due_day" type="number" min={1} max={28} defaultValue={c.payment_due_day ?? ""} /></Field>
          </> : <Field label="Contract value"><Input name="value" type="number" defaultValue={c.value ?? ""} /></Field>}
          <Field label="Payment terms" className="sm:col-span-2"><Textarea name="payment_terms" defaultValue={c.payment_terms ?? ""} /></Field>
          <Field label="Renewal terms" className="sm:col-span-2"><Textarea name="renewal_terms" defaultValue={c.renewal_terms ?? ""} /></Field>
          <Field label="Internal notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={c.notes ?? ""} /></Field>
          <div className="sm:col-span-2"><ErrorBox error={act.error} /><Button type="submit" busy={act.busy}>Save</Button></div>
        </form>
      </Modal>

      <Modal title="Renew contract" open={modal === "renew"} onClose={() => setModal(null)}>
        <p className="mb-4 text-sm text-stone-600">This creates a new draft agreement linked to {c.ref}. The current agreement and its terms are kept unchanged and marked Renewed.</p>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          await act.run(async () => {
            const newId = await q<string>(supabase.rpc("renew_contract", {
              p_contract: c.id, p_start: v.start, p_end: v.end, p_rent: v.rent ? Number(v.rent) : null, p_value: v.value ? Number(v.value) : null,
            }));
            setModal(null);
            navigate(`/admin/contracts/${newId}`);
          });
        }}>
          <Field label="New start date"><Input name="start" type="date" required defaultValue={c.end_date ? new Date(new Date(c.end_date).getTime() + 86400000).toISOString().slice(0, 10) : ""} /></Field>
          <Field label="New end date"><Input name="end" type="date" required /></Field>
          {isRental ? <Field label="New rent per month" hint="Leave blank to keep the current rent."><Input name="rent" type="number" placeholder={String(c.rent_amount ?? "")} /></Field>
            : <Field label="New value"><Input name="value" type="number" placeholder={String(c.value ?? "")} /></Field>}
          <ErrorBox error={act.error} />
          <Button type="submit" busy={act.busy}>Create renewal</Button>
        </form>
      </Modal>

      <Modal title="Terminate contract" open={modal === "terminate"} onClose={() => setModal(null)}>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          if (await act.run(() => q(supabase.from("contracts").update({ status: "terminated", terminated_on: v.date, termination_reason: v.reason, renewal_status: c.renewal_status ? "not_renewing" : null }).eq("id", c.id)), reload)) setModal(null);
        }}>
          <Field label="Termination date"><Input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          <Field label="Reason"><Textarea name="reason" required /></Field>
          <ErrorBox error={act.error} />
          <Button type="submit" variant="danger" busy={act.busy}>Terminate</Button>
        </form>
      </Modal>
    </>
  );
}

function PartiesCard({ c, editable, onChange }: { c: Row; editable: boolean; onChange: () => void }) {
  const act = useAction();
  const [customer, setCustomer] = useState<Row | null>(null);
  const [role, setRole] = useState("tenant");
  const [key, setKey] = useState(0);
  return (
    <Card title="Parties">
      <ErrorBox error={act.error} />
      {c.contract_parties.length === 0 && <p className="mb-3 text-sm text-amber-700">Add the parties before this contract can go for signature.</p>}
      <ul className="mb-4 space-y-2">
        {c.contract_parties.map((p: Row) => (
          <li key={`${p.customer_id}-${p.role}`} className="flex items-center justify-between text-sm">
            <span><Link className="text-brand-700 hover:underline" to={`/admin/customers/${p.customer_id}`}>{p.customers.full_name}</Link> <Badge>{p.role}</Badge></span>
            {editable && <button className="text-xs text-red-600 hover:underline" onClick={() => act.run(() => q(supabase.from("contract_parties").delete().match({ contract_id: c.id, customer_id: p.customer_id, role: p.role })), onChange)}>Remove</button>}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="space-y-2 border-t border-stone-100 pt-4">
          <RecordPicker key={key} table="customers" onPick={setCustomer} />
          <div className="flex gap-2">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>{["tenant", "landlord", "buyer", "seller", "owner", "guarantor", "other"].map((r) => <option key={r}>{r}</option>)}</Select>
            <Button variant="secondary" disabled={!customer} busy={act.busy} onClick={() => act.run(
              () => q(supabase.from("contract_parties").insert({ contract_id: c.id, customer_id: customer!.id, role })),
              () => { setCustomer(null); setKey(key + 1); onChange(); })}>Add</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DocumentsCard({ contractId, editable }: { contractId: string; editable: boolean }) {
  const l = useLookups();
  const act = useAction();
  const [kind, setKind] = useState("contract");
  const [notes, setNotes] = useState("");
  const { data, reload } = useLoad(() =>
    q<Row[]>(supabase.from("contract_documents").select("*").eq("contract_id", contractId).order("kind").order("version", { ascending: false })), [contractId]);

  async function upload(file: File | undefined) {
    if (!file) return;
    await act.run(async () => {
      if (file.size > 25 * 1024 * 1024) throw new Error("Files must be 25 MB or smaller");
      const path = `contracts/${contractId}/${crypto.randomUUID()}.${fileExt(file.name)}`;
      const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
      if (error) throw error;
      await q(supabase.from("contract_documents").insert({
        contract_id: contractId, kind, storage_path: path, file_name: file.name, mime_type: file.type || "application/octet-stream",
        size_bytes: file.size, notes: notes || null,
      }));
      setNotes("");
    }, reload);
  }

  return (
    <Card title="Documents">
      <ErrorBox error={act.error} />
      {editable && (
        <div className="mb-5 grid gap-2 rounded-lg bg-stone-50 p-3 sm:grid-cols-[160px_1fr_auto]">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["contract", "amendment", "renewal", "termination", "supporting"].map((k) => <option key={k} value={k}>{label(k)}</option>)}
          </Select>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (e.g. signed copy, stamp paper scan)" />
          <label className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 ${act.busy ? "opacity-50" : ""}`}>
            <Upload size={14} /> Upload
            <input type="file" accept={ACCEPT} className="hidden" disabled={act.busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <p className="text-xs text-stone-500 sm:col-span-3">PDF, Word, Excel, JPEG or PNG up to 25 MB. Uploading again adds a new version; earlier versions are kept.</p>
        </div>
      )}
      <Table rows={data} empty="No documents uploaded." columns={[
        { key: "file_name", header: "File", render: (r) => (
          <button className="flex items-center gap-1.5 text-left text-brand-700 hover:underline" onClick={() => act.run(async () => window.open(await signedUrl("documents", r.storage_path), "_blank"))}>
            <FileText size={14} className="shrink-0" /> {r.file_name}
          </button>) },
        { key: "kind", header: "Type", render: (r) => <>{label(r.kind)} <span className="text-xs text-stone-500">v{r.version}</span></> },
        { key: "notes", header: "Notes", render: (r) => <span className="text-xs">{r.notes ?? "—"}</span> },
        { key: "uploaded_at", header: "Uploaded", render: (r) => <span className="text-xs">{dateTime(r.uploaded_at)}<span className="block text-stone-500">{nameOf(l?.staff, r.uploaded_by, "id", "full_name")}</span></span> },
      ]} />
    </Card>
  );
}
