import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { useAuth } from "../auth";
import { date, dateTime, fileExt, label, money, nameOf, q, signedUrl, slugify, supabase, useLoad, useLookups, type Row } from "../lib";
import { RecordPicker } from "../pickers";
import { mediaUrl, type Media } from "../../lib/api";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Textarea, formValues, useAction } from "../ui";

const EMPTY: Row = {
  listing_type: "sale", currency: "PKR", country: "Pakistan", size_unit: "marla", availability: "available",
  publication: "draft", ownership: "third_party", video_urls: [], featured: false,
};

export default function PropertyEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { can } = useAuth();
  const l = useLookups();
  const save = useAction();

  const { data: p, error, reload } = useLoad(async () => {
    if (isNew) return EMPTY;
    return q<Row>(supabase.from("properties").select("*, property_features(feature_id), owner:customers!properties_owner_id_fkey(id, ref, full_name)").eq("id", id!).single());
  }, [id]);
  const [owner, setOwner] = useState<Row | null>(null);
  useEffect(() => setOwner(p?.owner ?? null), [p]);

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [features, setFeatures] = useState<number[]>([]);
  useEffect(() => {
    if (!p) return;
    setCategoryId(p.category_id ?? null);
    setTypeId(p.type_id ?? null);
    setFeatures((p.property_features ?? []).map((f: Row) => f.feature_id));
  }, [p]);

  if (!p || !l) return error ? <ErrorBox error={error} /> : <Spinner />;

  const editable = can("properties.edit");
  const type = l.types.find((t) => t.id === typeId);
  const hasRooms = type?.has_rooms ?? true;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    const row: Row = {
      title: v.title, description: v.description ?? "", category_id: Number(v.category_id), type_id: Number(v.type_id),
      listing_type: v.listing_type, price: v.price ? Number(v.price) : null, currency: v.currency, city: v.city, area: v.area,
      address: v.address, public_address: v.public_address, size: v.size ? Number(v.size) : null, size_unit: v.size_unit,
      bedrooms: hasRooms && v.bedrooms ? Number(v.bedrooms) : null, bathrooms: hasRooms && v.bathrooms ? Number(v.bathrooms) : null,
      floors: v.floors ? Number(v.floors) : null, furnishing: v.furnishing, featured: v.featured === "on",
      ownership: v.ownership, acquired_on: v.acquired_on, agent_id: v.agent_id, owner_id: owner?.id ?? null,
      listing_authorization: v.listing_authorization, authorization_expires_on: v.authorization_expires_on, authorization_notes: v.authorization_notes, branch_id: v.branch_id ? Number(v.branch_id) : null,
      internal_notes: v.internal_notes, seo_title: v.seo_title, seo_description: v.seo_description,
      video_urls: (v.video_urls ?? "").split(/\s+/).filter((u) => /^https?:\/\//.test(u)),
    };
    await save.run(async () => {
      let pid = id!;
      if (isNew) {
        const created = await q<Row>(supabase.from("properties").insert({ ...row, slug: `${slugify(row.title)}-${Date.now().toString(36)}` }).select("id").single());
        pid = created.id;
      } else {
        await q(supabase.from("properties").update(row).eq("id", pid));
      }
      await q(supabase.from("property_features").delete().eq("property_id", pid));
      if (features.length) await q(supabase.from("property_features").insert(features.map((f) => ({ property_id: pid, feature_id: f }))));
      if (isNew) navigate(`/admin/properties/${pid}`, { replace: true });
      else reload();
    });
  }

  return (
    <>
      <PageHeader
        back={{ to: "/admin/properties", label: "Properties" }}
        title={isNew ? "New property" : p.title}
        subtitle={!isNew && <span className="flex flex-wrap items-center gap-2">{p.ref} <Badge status={p.availability} /> <Badge status={p.publication} />
          {p.publication === "published" && <a href={`/property/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">View on website <ExternalLink size={12} /></a>}</span>}
      />

      {!isNew && <StatusActions p={p} onChange={reload} />}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <form onSubmit={onSubmit} className="space-y-6">
          <fieldset disabled={!editable} className="space-y-6">
            <Card title="Listing">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Title" className="sm:col-span-2"><Input name="title" required minLength={3} maxLength={160} defaultValue={p.title} /></Field>
                <Field label="Category">
                  <Select name="category_id" required value={categoryId ?? ""} onChange={(e) => { setCategoryId(Number(e.target.value)); setTypeId(null); }}>
                    <option value="" disabled>Choose…</option>
                    {l.categories.filter((c) => c.active || c.id === p.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Type">
                  <Select name="type_id" required value={typeId ?? ""} onChange={(e) => setTypeId(Number(e.target.value))}>
                    <option value="" disabled>Choose…</option>
                    {l.types.filter((t) => t.category_id === categoryId && (t.active || t.id === p.type_id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
                <Field label="Transaction type">
                  <Select name="listing_type" defaultValue={p.listing_type}><option value="sale">Sale</option><option value="rent">Rent</option></Select>
                </Field>
                <div className="grid grid-cols-[1fr_100px] gap-2">
                  <Field label="Price (rent per month)"><Input name="price" type="number" min={0} step="any" defaultValue={p.price ?? ""} /></Field>
                  <Field label="Currency"><Select name="currency" defaultValue={p.currency}>{l.currencies.filter((c) => c.active).map((c) => <option key={c.code}>{c.code}</option>)}</Select></Field>
                </div>
                <Field label="Description" className="sm:col-span-2" hint="At least 40 characters before it can be published.">
                  <Textarea name="description" rows={6} defaultValue={p.description} />
                </Field>
              </div>
            </Card>

            <Card title="Location">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="City"><Input name="city" required defaultValue={p.city} /></Field>
                <Field label="Area / society"><Input name="area" required defaultValue={p.area} /></Field>
                <Field label="Full address" hint="Staff only."><Input name="address" defaultValue={p.address ?? ""} /></Field>
                <Field label="Address shown on website" hint="Leave blank to show area and city."><Input name="public_address" defaultValue={p.public_address ?? ""} /></Field>
              </div>
            </Card>

            <Card title="Details">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid grid-cols-[1fr_110px] gap-2 sm:col-span-2">
                  <Field label="Size"><Input name="size" type="number" min={0} step="any" defaultValue={p.size ?? ""} /></Field>
                  <Field label="Unit"><Select name="size_unit" defaultValue={p.size_unit}>{l.units.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}</Select></Field>
                </div>
                <Field label="Floors"><Input name="floors" type="number" min={0} defaultValue={p.floors ?? ""} /></Field>
                {hasRooms && <>
                  <Field label="Bedrooms"><Input name="bedrooms" type="number" min={0} defaultValue={p.bedrooms ?? ""} /></Field>
                  <Field label="Bathrooms"><Input name="bathrooms" type="number" min={0} defaultValue={p.bathrooms ?? ""} /></Field>
                </>}
                <Field label="Furnishing">
                  <Select name="furnishing" defaultValue={p.furnishing ?? ""}>
                    <option value="">Not applicable</option><option value="furnished">Furnished</option>
                    <option value="semi_furnished">Semi-furnished</option><option value="unfurnished">Unfurnished</option>
                  </Select>
                </Field>
              </div>
              <p className="mt-5 mb-2 text-sm font-medium text-stone-700">Features</p>
              <div className="flex flex-wrap gap-2">
                {l.features.filter((f) => f.active || features.includes(f.id)).map((f) => {
                  const on = features.includes(f.id);
                  return (
                    <button type="button" key={f.id} onClick={() => setFeatures(on ? features.filter((x) => x !== f.id) : [...features, f.id])}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-stone-300 text-stone-600"}`}>
                      {f.name}
                    </button>
                  );
                })}
              </div>
              <Field label="Video links" className="mt-5" hint="YouTube or other URLs, one per line.">
                <Textarea name="video_urls" rows={2} defaultValue={(p.video_urls ?? []).join("\n")} />
              </Field>
            </Card>

            <Card title="Internal">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Responsible agent">
                  <Select name="agent_id" defaultValue={p.agent_id ?? ""}>
                    <option value="">Unassigned</option>
                    {l.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </Select>
                </Field>
                <Field label="Branch">
                  <Select name="branch_id" defaultValue={p.branch_id ?? ""}>
                    <option value="">—</option>
                    {l.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
                <Field label="Ownership">
                  <Select name="ownership" defaultValue={p.ownership}>
                    <option value="third_party">Marketed for a third-party owner</option><option value="client_owned">Owned by the business</option>
                  </Select>
                </Field>
                <Field label="Acquired on" hint="For business-owned stock."><Input name="acquired_on" type="date" defaultValue={p.acquired_on ?? ""} /></Field>
                <Field label="Legal owner" hint="The customer record of the owner or landlord.">
                  <RecordPicker key={p.id ?? "new"} table="customers" initial={owner} onPick={setOwner} />
                </Field>
                <Field label="Listing authorization">
                  <Select name="listing_authorization" defaultValue={p.listing_authorization ?? "none"}>
                    <option value="none">Not yet authorized</option><option value="verbal">Verbal permission</option>
                    <option value="non_exclusive">Written, non-exclusive</option><option value="exclusive">Written, exclusive</option>
                    <option value="client_owned">Business-owned (no authorization needed)</option>
                  </Select>
                </Field>
                <Field label="Authorization expires"><Input name="authorization_expires_on" type="date" defaultValue={p.authorization_expires_on ?? ""} /></Field>
                <Field label="Authorization notes"><Input name="authorization_notes" defaultValue={p.authorization_notes ?? ""} placeholder="e.g. signed mandate on file, 2% commission" /></Field>
                <Field label="Internal notes" className="sm:col-span-2"><Textarea name="internal_notes" defaultValue={p.internal_notes ?? ""} /></Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="featured" defaultChecked={p.featured} className="accent-brand-700" /> Show in featured properties on the home page
                </label>
              </div>
            </Card>

            <Card title="Search engine settings">
              <div className="grid gap-4">
                <Field label="Page title" hint="Defaults to the property title."><Input name="seo_title" maxLength={70} defaultValue={p.seo_title ?? ""} /></Field>
                <Field label="Meta description"><Textarea name="seo_description" maxLength={170} rows={2} defaultValue={p.seo_description ?? ""} /></Field>
              </div>
            </Card>
          </fieldset>

          <ErrorBox error={save.error} />
          {editable && <Button type="submit" busy={save.busy}>{isNew ? "Create property" : "Save changes"}</Button>}
        </form>

        {!isNew && (
          <div className="space-y-6">
            <PropertyOverview propertyId={p.id} />
            <MediaManager propertyId={p.id} editable={editable} />
            <Documents propertyId={p.id} editable={editable} />
            <OpenDeals propertyId={p.id} />
            <History propertyId={p.id} />
          </div>
        )}
      </div>
    </>
  );
}

function StatusActions({ p, onChange }: { p: Row; onChange: () => void }) {
  const { can } = useAuth();
  const l = useLookups();
  const act = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();

  const update = (patch: Row) => act.run(() => q(supabase.from("properties").update(patch).eq("id", p.id)), onChange);
  const pub = p.publication;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm font-medium text-stone-700">Website:</span>
        {can("properties.edit") && pub === "draft" && <Button variant="secondary" busy={act.busy} onClick={() => update({ publication: "under_review" })}>Submit for review</Button>}
        {can("properties.publish") && ["under_review"].includes(pub) && <Button variant="secondary" busy={act.busy} onClick={() => update({ publication: "approved" })}>Approve</Button>}
        {can("properties.publish") && ["draft", "under_review", "approved", "unpublished"].includes(pub) && <Button busy={act.busy} onClick={() => update({ publication: "published" })}>Publish</Button>}
        {can("properties.publish") && pub === "published" && <Button variant="secondary" busy={act.busy} onClick={() => update({ publication: "unpublished" })}>Unpublish</Button>}
        {can("properties.archive") && pub !== "archived" && <Button variant="secondary" busy={act.busy} onClick={() => update({ publication: "archived" })}>Archive</Button>}
        {can("properties.edit") && pub === "archived" && <Button variant="secondary" busy={act.busy} onClick={() => update({ publication: "draft" })}>Restore as draft</Button>}

        <span className="mr-2 ml-4 text-sm font-medium text-stone-700">Availability:</span>
        <select
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          value={p.availability}
          disabled={!can("properties.edit") || act.busy}
          onChange={(e) => update({ availability: e.target.value })}
        >
          {l?.availability.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
        </select>

        {can("properties.delete") && <Button variant="ghost" className="ml-auto text-red-600" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete</Button>}
      </div>
      {act.error && <p className="mt-3 text-sm text-red-700">{act.error}</p>}
      <Modal title="Delete property permanently?" open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <p className="text-sm text-stone-700">This removes {p.ref} and its photos for good. Properties with transactions, contracts or payments can't be deleted — archive those instead.</p>
        <ErrorBox error={act.error} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" busy={act.busy} onClick={() => act.run(() => q(supabase.from("properties").delete().eq("id", p.id)), () => navigate("/admin/properties"))}>Delete</Button>
        </div>
      </Modal>
    </Card>
  );
}

function MediaManager({ propertyId, editable }: { propertyId: string; editable: boolean }) {
  const act = useAction();
  const { data, reload } = useLoad(() =>
    q<Row[]>(supabase.from("property_media").select("*").eq("property_id", propertyId).in("kind", ["image", "video"]).order("sort")), [propertyId]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    await act.run(async () => {
      let sort = (data?.length ?? 0);
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB`);
        const path = `properties/${propertyId}/${crypto.randomUUID()}.${fileExt(file.name)}`;
        const { error } = await supabase.storage.from("property-media").upload(path, file, { contentType: file.type });
        if (error) throw error;
        await q(supabase.from("property_media").insert({ property_id: propertyId, kind: "image", storage_path: path, file_name: file.name, sort: sort++ }));
      }
    }, reload);
  }

  async function move(i: number, dir: -1 | 1) {
    if (!data) return;
    const a = data[i], b = data[i + dir];
    if (!b) return;
    await act.run(async () => {
      await q(supabase.from("property_media").update({ sort: b.sort }).eq("id", a.id));
      await q(supabase.from("property_media").update({ sort: a.sort }).eq("id", b.id));
    }, reload);
  }

  async function remove(m: Row) {
    await act.run(async () => {
      await q(supabase.from("property_media").delete().eq("id", m.id));
      if (m.storage_path) await supabase.storage.from("property-media").remove([m.storage_path]);
    }, reload);
  }

  async function setAlt(m: Row, alt: string) {
    if (alt !== (m.alt ?? "")) await supabase.from("property_media").update({ alt }).eq("id", m.id);
  }

  return (
    <Card title="Photos" actions={editable && (
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">
        <Upload size={14} /> Upload
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </label>
    )}>
      <ErrorBox error={act.error} />
      {act.busy && <p className="mb-2 text-sm text-stone-500">Working…</p>}
      {data?.length === 0 && <p className="text-sm text-stone-500">No photos yet. At least one is needed to publish. The first photo is the cover.</p>}
      <ul className="space-y-3">
        {data?.map((m, i) => (
          <li key={m.id} className="flex gap-3">
            <img src={mediaUrl(m as Media).replace("w=1600", "w=300")} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <input defaultValue={m.alt ?? ""} placeholder="Alt text (describe the photo)" disabled={!editable}
                onBlur={(e) => setAlt(m, e.target.value)} className="w-full rounded border border-stone-200 px-2 py-1 text-xs" />
              {editable && (
                <div className="mt-1 flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" aria-label="Move up"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === data.length - 1} className="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" aria-label="Move down"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => remove(m)} className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="Remove"><Trash2 size={14} /></button>
                  {i === 0 && <Badge tone="green">Cover</Badge>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Documents({ propertyId, editable }: { propertyId: string; editable: boolean }) {
  const act = useAction();
  const { data, reload } = useLoad(() =>
    q<Row[]>(supabase.from("property_media").select("*").eq("property_id", propertyId).eq("kind", "document").order("created_at")), [propertyId]);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await act.run(async () => {
      const path = `properties/${propertyId}/${crypto.randomUUID()}.${fileExt(file.name)}`;
      const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
      if (error) throw error;
      await q(supabase.from("property_media").insert({ property_id: propertyId, kind: "document", storage_path: path, file_name: file.name, is_public: false }));
    }, reload);
  }

  return (
    <Card title="Documents" actions={editable && (
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-50">
        <Upload size={14} /> Upload
        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" className="hidden" onChange={(e) => upload(e.target.files)} />
      </label>
    )}>
      <ErrorBox error={act.error} />
      <p className="mb-3 text-xs text-stone-500">Ownership papers, maps and other files. Staff only — never shown on the website.</p>
      {data?.length === 0 && <p className="text-sm text-stone-500">No documents.</p>}
      <ul className="space-y-2">
        {data?.map((d) => (
          <li key={d.id}>
            <button type="button" className="flex items-center gap-2 text-sm text-brand-700 hover:underline"
              onClick={() => act.run(async () => window.open(await signedUrl("documents", d.storage_path), "_blank"))}>
              <FileText size={14} /> {d.file_name}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Everything linked to this property in one place (BRD §24): leads, buyers/tenants, contracts with
// renewals, payment schedules, money received and outstanding. Each part only appears if the role can see it.
function PropertyOverview({ propertyId }: { propertyId: string }) {
  const { can } = useAuth();
  const l = useLookups();
  const { data } = useLoad(async () => {
    const [leads, txs, contracts, schedules] = await Promise.all([
      can("leads.view_all") || can("leads.view_assigned")
        ? q<Row[]>(supabase.from("leads").select("id, ref, name, inquiry_type, status_id, created_at").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(20)) : [],
      can("transactions.view") || can("transactions.view_own")
        ? q<Row[]>(supabase.from("transactions").select("id, ref, kind, status_id, agreed_price, currency, transaction_parties(role, customers(id, full_name))").eq("property_id", propertyId).order("created_at", { ascending: false })) : [],
      can("contracts.view") || can("contracts.view_own")
        ? q<Row[]>(supabase.from("contracts").select("id, ref, status, type_id, start_date, end_date, previous_contract_id, contract_parties(role, customers(id, full_name))").eq("property_id", propertyId).order("start_date", { ascending: false })) : [],
      can("payments.view") ? q<Row[]>(supabase.from("schedule_balances").select("id, ref, title, total, paid, outstanding, overdue, currency, status").eq("property_id", propertyId)) : [],
    ]);
    return { leads, txs, contracts, schedules };
  }, [propertyId]);
  if (!data || !l) return null;

  const parties = (list: Row[], roles: string[]) =>
    list.flatMap((x) => (x.transaction_parties ?? x.contract_parties ?? []).filter((p: Row) => roles.includes(p.role)).map((p: Row) => p.customers))
      .filter((c, i, arr) => c && arr.findIndex((o) => o?.id === c.id) === i);
  const buyers = parties(data.txs, ["buyer", "co_buyer"]);
  const tenants = parties(data.contracts.filter((c) => ["active", "expiring_soon"].includes(c.status)), ["tenant"]);
  const totals = data.schedules.reduce((a, s) => ({ paid: a.paid + Number(s.paid), outstanding: a.outstanding + Number(s.outstanding), overdue: a.overdue + Number(s.overdue) }), { paid: 0, outstanding: 0, overdue: 0 });
  const empty = !data.leads.length && !data.txs.length && !data.contracts.length && !data.schedules.length;

  return (
    <Card title="Property overview">
      {empty && <p className="text-sm text-stone-500">No leads, deals, contracts or payments yet.</p>}
      {(buyers.length > 0 || tenants.length > 0) && (
        <p className="mb-3 text-sm">
          {buyers.length > 0 && <>Buyer: {buyers.map((c) => <Link key={c.id} className="text-brand-700 hover:underline" to={`/admin/customers/${c.id}`}>{c.full_name}</Link>)} </>}
          {tenants.length > 0 && <>Current tenant: {tenants.map((c) => <Link key={c.id} className="text-brand-700 hover:underline" to={`/admin/customers/${c.id}`}>{c.full_name}</Link>)}</>}
        </p>
      )}
      {data.schedules.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-emerald-50 p-2"><p className="text-stone-500">Received</p><p className="font-semibold text-emerald-700">{money(totals.paid)}</p></div>
          <div className="rounded-lg bg-amber-50 p-2"><p className="text-stone-500">Outstanding</p><p className="font-semibold text-amber-800">{money(totals.outstanding)}</p></div>
          <div className="rounded-lg bg-red-50 p-2"><p className="text-stone-500">Overdue</p><p className="font-semibold text-red-700">{money(totals.overdue)}</p></div>
        </div>
      )}
      <OverviewList title="Leads" rows={data.leads} render={(r) => <><Link className="text-brand-700 hover:underline" to={`/admin/leads/${r.id}`}>{r.ref}</Link> {r.name} <span className="text-stone-500">· {r.inquiry_type} · {nameOf(l.leadStatuses, r.status_id)}</span></>} />
      <OverviewList title="Sales and purchases" rows={data.txs} render={(r) => <><Link className="text-brand-700 hover:underline" to={`/admin/transactions/${r.id}`}>{r.ref}</Link> {r.kind} · {money(r.agreed_price, r.currency)} <span className="text-stone-500">· {nameOf(l.txStatuses, r.status_id)}</span></>} />
      <OverviewList title="Contracts and renewals" rows={data.contracts} render={(r) => <><Link className="text-brand-700 hover:underline" to={`/admin/contracts/${r.id}`}>{r.ref}</Link> {nameOf(l.contractTypes, r.type_id)} <Badge status={r.status} /><span className="block text-xs text-stone-500">{date(r.start_date)} – {date(r.end_date)}{r.previous_contract_id ? " · renewal" : ""}</span></>} />
      <OverviewList title="Payment schedules" rows={data.schedules} render={(r) => <><Link className="text-brand-700 hover:underline" to={`/admin/payments/${r.id}`}>{r.ref}</Link> {r.title} <Badge status={r.status} /><span className="block text-xs text-stone-500">Paid {money(r.paid, r.currency)} of {money(r.total, r.currency)}</span></>} />
    </Card>
  );
}

function OverviewList({ title, rows, render }: { title: string; rows: Row[]; render: (r: Row) => React.ReactNode }) {
  if (!rows.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p>
      <ul className="space-y-1.5 text-sm">{rows.map((r) => <li key={r.id}>{render(r)}</li>)}</ul>
    </div>
  );
}

function OpenDeals({ propertyId }: { propertyId: string }) {
  const { data } = useLoad(() => q<Row[]>(supabase.rpc("property_open_deals", { p_property: propertyId })), [propertyId]);
  if (!data?.length) return null;
  return (
    <Card title={<span className="flex items-center gap-2"><AlertTriangle size={16} className="text-amber-600" /> Open deals on this property</span>}>
      <p className="mb-3 text-xs text-stone-500">Check these before starting another sale, purchase or rental for this property.</p>
      <ul className="space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.id}>
            <a className="text-brand-700 hover:underline" href={`/admin/${d.kind === "contract" ? "contracts" : "transactions"}/${d.id}`}>{d.ref}</a>
            <span className="text-stone-500"> · {label(d.kind)} · {d.status}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function History({ propertyId }: { propertyId: string }) {
  const l = useLookups();
  const { data } = useLoad(() =>
    q<Row[]>(supabase.from("property_history").select("*").eq("property_id", propertyId).order("changed_at", { ascending: false }).limit(50)), [propertyId]);
  return (
    <Card title="Change history">
      <Table rows={data} empty="No price or status changes yet." columns={[
        { key: "field", header: "Change", render: (r) => <><span className="font-medium">{label(r.field)}</span><span className="block text-xs text-stone-500">{r.old_value ?? "—"} → {r.new_value ?? "—"}</span></> },
        { key: "changed_at", header: "When", render: (r) => <span className="text-xs">{dateTime(r.changed_at)}<span className="block text-stone-500">{nameOf(l?.staff, r.changed_by, "id", "full_name")}</span></span> },
      ]} />
    </Card>
  );
}
