import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { loadLookups, q, supabase, useLoad, type Row } from "../lib";
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Table, Tabs, Textarea, formValues, useAction } from "../ui";

export default function SettingsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const admin = can("settings.manage");
  const tabs = [
    { key: "account", label: "My account" },
    ...(admin ? [
      { key: "business", label: "Business details" }, { key: "lists", label: "Categories and lists" },
      { key: "reminders", label: "Reminders" }, { key: "commissions", label: "Commission rules" }, { key: "system", label: "System" },
    ] : []),
  ];
  const tab = tabs.some((t) => t.key === params.get("tab")) ? params.get("tab")! : admin ? "business" : "account";

  return (
    <>
      <PageHeader title="Settings" />
      <Tabs tabs={tabs} value={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
      {tab === "account" && <Account />}
      {tab === "business" && <Business />}
      {tab === "lists" && <Lists />}
      {tab === "reminders" && <Reminders />}
      {tab === "commissions" && <CommissionRules />}
      {tab === "system" && <SystemSettings />}
    </>
  );
}

function Account() {
  const { staff, session } = useAuth();
  const act = useAction();
  const [done, setDone] = useState(false);
  return (
    <Card title="Change password" className="max-w-lg">
      <p className="mb-4 text-sm text-stone-600">Signed in as {session?.user.email} ({staff?.role?.replace("_", " ")}).</p>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const v = formValues(form);
        setDone(false);
        if (v.password !== v.confirm) return act.setError("The passwords don't match");
        if (await act.run(async () => { const { error } = await supabase.auth.updateUser({ password: v.password! }); if (error) throw error; })) { setDone(true); form.reset(); }
      }}>
        <Field label="New password" hint="At least 10 characters."><Input name="password" type="password" minLength={10} required autoComplete="new-password" /></Field>
        <Field label="Confirm new password"><Input name="confirm" type="password" minLength={10} required autoComplete="new-password" /></Field>
        <ErrorBox error={act.error} />
        {done && <p className="text-sm text-emerald-700">Password updated.</p>}
        <Button type="submit" busy={act.busy}>Update password</Button>
      </form>
    </Card>
  );
}

function Business() {
  const act = useAction();
  const [saved, setSaved] = useState(false);
  const { data } = useLoad(() => q<Row>(supabase.from("settings").select("value").eq("key", "business").single()));
  if (!data) return null;
  const b = data.value;
  return (
    <Card title="Business details" className="max-w-3xl">
      <p className="mb-4 text-sm text-stone-600">Shown across the website, on receipts and in the footer.</p>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        const v = formValues(e.currentTarget);
        if (await act.run(() => q(supabase.from("settings").update({ value: { ...b, ...v } }).eq("key", "business")))) setSaved(true);
      }}>
        <Field label="Business name"><Input name="name" required defaultValue={b.name} /></Field>
        <Field label="Tagline"><Input name="tagline" defaultValue={b.tagline} /></Field>
        <Field label="Phone"><Input name="phone" required defaultValue={b.phone} /></Field>
        <Field label="WhatsApp number"><Input name="whatsapp" defaultValue={b.whatsapp} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={b.email} /></Field>
        <Field label="Office hours"><Input name="hours" defaultValue={b.hours} /></Field>
        <Field label="Office address" className="sm:col-span-2"><Input name="address" defaultValue={b.address} /></Field>
        <Field label="About us text" className="sm:col-span-2"><Textarea name="about" rows={5} defaultValue={b.about} /></Field>
        <div className="sm:col-span-2"><ErrorBox error={act.error} />{saved && <p className="mb-2 text-sm text-emerald-700">Saved. The website shows the new details on next load.</p>}<Button type="submit" busy={act.busy}>Save</Button></div>
      </form>
    </Card>
  );
}

interface ListDef { table: string; title: string; slug?: boolean; extra?: { key: string; label: string; type: "bool" | "number" | "text" | "category" }[]; hasActive?: boolean; order?: string }

const LISTS: ListDef[] = [
  { table: "property_categories", title: "Property categories", slug: true, extra: [{ key: "sort", label: "Order", type: "number" }], hasActive: true, order: "sort" },
  { table: "property_types", title: "Property types (subcategories)", slug: true, extra: [{ key: "category_id", label: "Category", type: "category" }, { key: "has_rooms", label: "Has bedrooms / bathrooms", type: "bool" }, { key: "sort", label: "Order", type: "number" }], hasActive: true, order: "sort" },
  { table: "features", title: "Property features", slug: true, extra: [{ key: "sort", label: "Order", type: "number" }], hasActive: true, order: "sort" },
  { table: "lead_sources", title: "Lead sources", slug: true, hasActive: true },
  { table: "party_categories", title: "Customer and lead categories", slug: true, hasActive: true },
  { table: "lead_statuses", title: "Lead statuses", slug: true, extra: [{ key: "sort", label: "Order", type: "number" }, { key: "is_closed", label: "Closed", type: "bool" }, { key: "is_won", label: "Won", type: "bool" }], hasActive: true, order: "sort" },
  { table: "transaction_statuses", title: "Transaction statuses", slug: true, extra: [{ key: "sort", label: "Order", type: "number" }, { key: "is_closed", label: "Closed", type: "bool" }], hasActive: true, order: "sort" },
  { table: "contract_types", title: "Contract types", slug: true, hasActive: true },
  { table: "branches", title: "Branches", extra: [{ key: "city", label: "City", type: "text" }, { key: "phone", label: "Phone", type: "text" }, { key: "address", label: "Address", type: "text" }], hasActive: true },
];

const CORE_SLUGS = new Set(["new", "won", "lost", "completed", "cancelled", "negotiation", "offer", "contract-preparation", "rental", "lease", "renewal", "sale", "purchase", "website-inquiry", "website-viewing", "sell-your-property", "buyer", "seller", "tenant", "landlord"]);

function Lists() {
  const [which, setWhich] = useState(LISTS[0].table);
  const def = LISTS.find((d) => d.table === which)!;
  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <ul className="space-y-0.5">
        {LISTS.map((d) => (
          <li key={d.table}><button onClick={() => setWhich(d.table)} className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${d.table === which ? "bg-brand-50 font-medium text-brand-800" : "text-stone-700 hover:bg-stone-100"}`}>{d.title}</button></li>
        ))}
      </ul>
      <ListEditor key={def.table} def={def} />
    </div>
  );
}

function ListEditor({ def }: { def: ListDef }) {
  const act = useAction();
  const { data, reload } = useLoad(() => q<Row[]>(supabase.from(def.table).select("*").order(def.order ?? "id")), [def.table]);
  const cats = useLoad(async () => def.extra?.some((e) => e.type === "category") ? q<Row[]>(supabase.from("property_categories").select("id, name").order("sort")) : ([] as Row[]), [def.table]);
  const done = () => { reload(); loadLookups(true); };

  const save = (row: Row, patch: Row) => act.run(() => q(supabase.from(def.table).update(patch).eq("id", row.id)), done);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    const row: Row = { name: v.name };
    if (def.slug) row.slug = (v.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    def.extra?.forEach((x) => {
      if (x.type === "bool") row[x.key] = v[x.key] === "on";
      else if (x.type === "number" || x.type === "category") row[x.key] = v[x.key] ? Number(v[x.key]) : x.type === "number" ? 0 : null;
      else row[x.key] = v[x.key];
    });
    if (await act.run(() => q(supabase.from(def.table).insert(row)), done)) form.reset();
  }

  return (
    <Card title={def.title}>
      <ErrorBox error={act.error} />
      <p className="mb-4 text-xs text-stone-500">Rename items or switch them off. Items in use can't be deleted — deactivate them instead so history stays intact.</p>
      <Table rows={data} columns={[
        { key: "name", header: "Name", render: (r) => <Input defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && e.target.value.trim() && save(r, { name: e.target.value.trim() })} /> },
        ...(def.slug ? [{ key: "slug", header: "Code", render: (r: Row) => <span className="text-xs text-stone-500">{r.slug}{CORE_SLUGS.has(r.slug) && <span className="ml-1"><Badge>system</Badge></span>}</span> }] : []),
        ...(def.extra ?? []).map((x) => ({
          key: x.key, header: x.label, render: (r: Row) =>
            x.type === "bool" ? <input type="checkbox" className="accent-brand-700" checked={!!r[x.key]} onChange={(e) => save(r, { [x.key]: e.target.checked })} />
            : x.type === "category" ? <Select value={r[x.key] ?? ""} onChange={(e) => save(r, { [x.key]: Number(e.target.value) })}>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            : <Input type={x.type === "number" ? "number" : "text"} className={x.type === "number" ? "w-20" : ""} defaultValue={r[x.key] ?? ""}
                onBlur={(e) => String(r[x.key] ?? "") !== e.target.value && save(r, { [x.key]: x.type === "number" ? Number(e.target.value) : e.target.value || null })} />,
        })),
        ...(def.hasActive ? [{ key: "active", header: "Active", render: (r: Row) => <input type="checkbox" className="accent-brand-700" checked={r.active} onChange={(e) => save(r, { active: e.target.checked })} /> }] : []),
      ]} />
      <form onSubmit={add} className="mt-5 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4">
        <Field label="Add new"><Input name="name" required placeholder="Name" /></Field>
        {def.extra?.map((x) => x.type === "bool"
          ? <label key={x.key} className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name={x.key} className="accent-brand-700" /> {x.label}</label>
          : x.type === "category"
            ? <Field key={x.key} label={x.label}><Select name={x.key} required>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            : <Field key={x.key} label={x.label}><Input name={x.key} type={x.type === "number" ? "number" : "text"} className={x.type === "number" ? "w-20" : ""} /></Field>)}
        <Button type="submit" busy={act.busy}>Add</Button>
      </form>
    </Card>
  );
}

const KIND_LABEL: Record<string, string> = {
  payment_upcoming: "Upcoming payment", payment_due: "Payment due", payment_overdue: "Overdue payment", escalation: "Management escalation",
  contract_expiry: "Contract expiry", contract_renewal: "Renewal action date", follow_up: "Lead follow-up", viewing: "Property viewing", stale_lead: "Lead without activity",
};

function Reminders() {
  const act = useAction();
  const { data, reload } = useLoad(() => q<Row[]>(supabase.from("reminder_rules").select("*").order("kind").order("offset_days")));
  const log = useLoad(() => q<Row[]>(supabase.from("reminder_log").select("*").order("created_at", { ascending: false }).limit(50)));
  const save = (r: Row, patch: Row) => act.run(() => q(supabase.from("reminder_rules").update(patch).eq("id", r.id)), reload);

  return (
    <div className="space-y-6">
      <Card title="Reminder rules">
        <ErrorBox error={act.error} />
        <p className="mb-4 text-sm text-stone-600">
          Offsets are days relative to the due date, contract end date or scheduled time: −7 means a week before, 3 means three days after.
          Reminders run every morning at 8:00 and never repeat. Fully paid installments get no reminders; partly paid ones show the remaining amount.
          Email, SMS and WhatsApp are queued in the log until a messaging provider is connected.
        </p>
        <Table rows={data} columns={[
          { key: "kind", header: "Reminder", render: (r) => KIND_LABEL[r.kind] ?? r.kind },
          { key: "offset_days", header: "Days", render: (r) => <Input type="number" className="w-20" defaultValue={r.offset_days} onBlur={(e) => Number(e.target.value) !== r.offset_days && save(r, { offset_days: Number(e.target.value) })} /> },
          { key: "notify_staff", header: "Staff recipient", render: (r) => (
            <Select value={r.notify_staff} onChange={(e) => save(r, { notify_staff: e.target.value })}>
              <option value="responsible">Responsible employee / agent</option><option value="finance">Finance team</option><option value="managers">Managers</option><option value="none">No staff</option>
            </Select>) },
          { key: "notify_customer", header: "Customer", render: (r) => <input type="checkbox" className="accent-brand-700" checked={r.notify_customer} onChange={(e) => save(r, { notify_customer: e.target.checked })} /> },
          { key: "channels", header: "Channels", render: (r) => (
            <span className="flex flex-wrap gap-2 text-xs">
              {["in_app", "email", "sms", "whatsapp"].map((ch) => (
                <label key={ch} className="flex items-center gap-1">
                  <input type="checkbox" className="accent-brand-700" checked={r.channels.includes(ch)}
                    onChange={(e) => { const next = e.target.checked ? [...r.channels, ch] : r.channels.filter((c: string) => c !== ch); if (next.length) save(r, { channels: next }); }} />
                  {ch.replace("_", "-")}
                </label>
              ))}
            </span>) },
          { key: "active", header: "On", render: (r) => <input type="checkbox" className="accent-brand-700" checked={r.active} onChange={(e) => save(r, { active: e.target.checked })} /> },
        ]} />
        <form className="mt-5 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4" onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          await act.run(() => q(supabase.from("reminder_rules").insert({ kind: v.kind, offset_days: Number(v.offset_days), notify_staff: v.notify_staff })), reload);
        }}>
          <Field label="Add rule"><Select name="kind">{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Days"><Input name="offset_days" type="number" required className="w-24" /></Field>
          <Field label="Staff"><Select name="notify_staff"><option value="responsible">Responsible</option><option value="finance">Finance</option><option value="managers">Managers</option></Select></Field>
          <Button type="submit" busy={act.busy}>Add</Button>
        </form>
      </Card>

      <Card title="Recent reminder log">
        <Table rows={log.data} empty="No reminders sent yet." columns={[
          { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString("en-GB") },
          { key: "category", header: "Type", render: (r) => KIND_LABEL[r.category] ?? r.category },
          { key: "title", header: "Reminder" },
          { key: "channel", header: "Channel" },
          { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
          { key: "error", header: "Error", render: (r) => <span className="text-xs text-red-600">{r.error ?? ""}</span> },
        ]} />
      </Card>
    </div>
  );
}

const BASIS_LABEL: Record<string, string> = {
  percent_of_price: "% of price / contract value",
  months_rent: "× monthly rent",
  percent_of_brokerage: "% of brokerage earned",
  fixed: "Fixed amount (PKR)",
};

function CommissionRules() {
  const act = useAction();
  const { data, reload } = useLoad(() => q<Row[]>(supabase.from("commission_rules").select("*").order("sort")));
  const save = (r: Row, patch: Row) => act.run(() => q(supabase.from("commission_rules").update(patch).eq("id", r.id)), reload);

  return (
    <Card title="Commission rules">
      <ErrorBox error={act.error} />
      <p className="mb-4 text-sm text-stone-600">
        When a sale or purchase is marked Completed, or a rental contract becomes Active, every active rule that matches creates a pending commission.
        Brokerage rules create one commission per buyer, seller, tenant or landlord on the deal. Agent rules pay the deal's agent (or the contract's responsible employee).
        Changing a rule only affects commissions calculated afterwards.
      </p>
      <Table rows={data} columns={[
        { key: "name", header: "Name", render: (r) => <Input defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && save(r, { name: e.target.value.trim() })} /> },
        { key: "kind", header: "Kind", render: (r) => <Badge tone={r.kind === "brokerage" ? "green" : "purple"}>{r.kind}</Badge> },
        { key: "applies_to", header: "Deals", render: (r) => (
          <Select value={r.applies_to} onChange={(e) => save(r, { applies_to: e.target.value })}>
            {["sale", "purchase", "rental", "any"].map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>) },
        { key: "rate", header: "Rate", render: (r) => <span className="flex items-center gap-2 whitespace-nowrap"><Input type="number" step="any" min={0} className="w-24" defaultValue={r.rate}
          onBlur={(e) => Number(e.target.value) !== Number(r.rate) && save(r, { rate: Number(e.target.value) })} /><span className="text-xs text-stone-500">{BASIS_LABEL[r.basis]}</span></span> },
        { key: "payer_role", header: "Paid by", render: (r) => r.kind === "brokerage" ? r.payer_role : "—" },
        { key: "active", header: "On", render: (r) => <input type="checkbox" className="accent-brand-700" checked={r.active} onChange={(e) => save(r, { active: e.target.checked })} /> },
      ]} />
      <form className="mt-5 grid gap-2 border-t border-stone-100 pt-4 sm:grid-cols-6" onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const v = formValues(form);
        if (await act.run(() => q(supabase.from("commission_rules").insert({
          name: v.name, kind: v.kind, applies_to: v.applies_to, basis: v.basis, rate: Number(v.rate),
          payer_role: v.kind === "brokerage" ? v.payer_role : null, sort: (data?.length ?? 0) + 1,
        })), reload)) form.reset();
      }}>
        <Field label="New rule" className="sm:col-span-2"><Input name="name" required placeholder="e.g. Commercial rental brokerage" /></Field>
        <Field label="Kind"><Select name="kind"><option value="brokerage">Brokerage</option><option value="agent">Agent</option><option value="referral">Referral</option></Select></Field>
        <Field label="Deals"><Select name="applies_to">{["sale", "purchase", "rental", "any"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Basis"><Select name="basis">{Object.entries(BASIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Rate"><Input name="rate" type="number" step="any" min={0} required /></Field>
        <Field label="Paid by (brokerage)"><Select name="payer_role">{["buyer", "seller", "tenant", "landlord"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <div className="flex items-end"><Button type="submit" busy={act.busy}>Add rule</Button></div>
      </form>
    </Card>
  );
}

function SystemSettings() {
  const act = useAction();
  const [saved, setSaved] = useState(false);
  const { data } = useLoad(() => q<Row[]>(supabase.from("settings").select("key, value").in("key", ["contract_expiring_soon_days", "lead_stale_after_days", "publication_requires_approval"])));
  if (!data) return null;
  const get = (k: string) => data.find((d) => d.key === k)?.value;
  return (
    <Card title="Workflow settings" className="max-w-xl">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        const v = formValues(e.currentTarget);
        if (await act.run(async () => {
          await q(supabase.from("settings").update({ value: Number(v.expiring) }).eq("key", "contract_expiring_soon_days"));
          await q(supabase.from("settings").update({ value: Number(v.stale) }).eq("key", "lead_stale_after_days"));
          await q(supabase.from("settings").update({ value: v.approval === "on" }).eq("key", "publication_requires_approval"));
        })) setSaved(true);
      }}>
        <Field label="Mark contracts “Expiring soon” this many days before the end date"><Input name="expiring" type="number" min={1} max={365} defaultValue={get("contract_expiring_soon_days")} /></Field>
        <Field label="Flag leads with no activity after this many days"><Input name="stale" type="number" min={1} max={90} defaultValue={get("lead_stale_after_days")} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="approval" className="accent-brand-700" defaultChecked={get("publication_requires_approval") === true} /> Listings must be approved before they can be published</label>
        <ErrorBox error={act.error} />
        {saved && <p className="text-sm text-emerald-700">Saved.</p>}
        <Button type="submit" busy={act.busy}>Save</Button>
      </form>
    </Card>
  );
}
