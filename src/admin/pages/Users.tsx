import { useState } from "react";
import { useAuth } from "../auth";
import { date, dateTime, loadLookups, q, supabase, useLoad, type Row } from "../lib";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Table, Tabs, formValues, useAction } from "../ui";

export default function UsersPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState("staff");
  if (!can("users.manage")) return <PageHeader title="Users" subtitle="You don't have permission to manage users." />;
  return (
    <>
      <PageHeader title="Users and access" subtitle="New staff create an account from the sign-in page, then appear under Pending for you to approve." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "staff", label: "Staff" }, { key: "pending", label: "Pending sign-ups" }, { key: "roles", label: "Roles and permissions" }, { key: "audit", label: "Audit log" }]} />
      {tab === "staff" && <Staff />}
      {tab === "pending" && <Pending />}
      {tab === "roles" && <Roles />}
      {tab === "audit" && <Audit />}
    </>
  );
}

function useRoles() {
  return useLoad(async () => {
    const [roles, perms, rp] = await Promise.all([
      q<Row[]>(supabase.from("roles").select("*")), q<Row[]>(supabase.from("permissions").select("*").order("slug")),
      q<Row[]>(supabase.from("role_permissions").select("*")),
    ]);
    return { roles, perms, rp };
  });
}

function Staff() {
  const act = useAction();
  const { staff: me } = useAuth();
  const [editing, setEditing] = useState<Row | null>(null);
  const roles = useRoles();
  const { data, reload } = useLoad(() => q<Row[]>(supabase.from("staff").select("*, staff_permissions(permission), branches(name)").order("full_name")));
  const done = () => { reload(); loadLookups(true); };

  return (
    <Card>
      <ErrorBox error={act.error} />
      <Table rows={data} onRowClick={setEditing} columns={[
        { key: "full_name", header: "Name", render: (r) => <><span className="font-medium">{r.full_name}</span>{r.id === me?.id && <span className="ml-2 text-xs text-stone-500">(you)</span>}<span className="block text-xs text-stone-500">{r.email}</span></> },
        { key: "role", header: "Role", render: (r) => roles.data?.roles.find((x) => x.slug === r.role)?.name ?? r.role },
        { key: "extra", header: "Extra permissions", render: (r) => <span className="flex flex-wrap gap-1">{r.staff_permissions.map((p: Row) => <Badge key={p.permission} tone="purple">{p.permission}</Badge>)}</span> },
        { key: "branch", header: "Branch", render: (r) => r.branches?.name ?? "—" },
        { key: "active", header: "Status", render: (r) => <Badge tone={r.active ? "green" : "gray"}>{r.active ? "Active" : "Deactivated"}</Badge> },
      ]} />
      {editing && roles.data && <EditStaff s={editing} roles={roles.data} onClose={() => setEditing(null)} onSaved={done} />}
    </Card>
  );
}

function EditStaff({ s, roles, onClose, onSaved }: { s: Row; roles: { roles: Row[]; perms: Row[]; rp: Row[] }; onClose: () => void; onSaved: () => void }) {
  const act = useAction();
  const { staff: me } = useAuth();
  const branches = useLoad(() => q<Row[]>(supabase.from("branches").select("id, name").eq("active", true)));
  const [role, setRole] = useState(s.role);
  const [extra, setExtra] = useState<string[]>(s.staff_permissions.map((p: Row) => p.permission));
  const fromRole = new Set(roles.rp.filter((x) => x.role === role).map((x) => x.permission));

  return (
    <Modal title={`Edit ${s.full_name}`} open onClose={onClose} wide>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        if (await act.run(async () => {
          await q(supabase.from("staff").update({ full_name: v.full_name, phone: v.phone, role, branch_id: v.branch_id ? Number(v.branch_id) : null, active: v.active === "on" }).eq("id", s.id));
          const current = new Set<string>(s.staff_permissions.map((p: Row) => p.permission));
          const want = new Set(extra.filter((p) => !fromRole.has(p)));
          const remove = [...current].filter((p) => !want.has(p));
          const add = [...want].filter((p) => !current.has(p));
          if (remove.length) await q(supabase.from("staff_permissions").delete().eq("staff_id", s.id).in("permission", remove));
          if (add.length) await q(supabase.from("staff_permissions").insert(add.map((p) => ({ staff_id: s.id, permission: p, granted_by: me!.id }))));
        }, onSaved)) onClose();
      }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input name="full_name" required defaultValue={s.full_name} /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={s.phone ?? ""} /></Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>{roles.roles.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}</Select>
          </Field>
          <Field label="Branch">
            <Select name="branch_id" defaultValue={s.branch_id ?? ""}><option value="">—</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} className="accent-brand-700" disabled={s.id === me?.id} /> Active (unticking blocks sign-in to the back office)</label>
        <div>
          <p className="mb-1 text-sm font-medium">Permissions</p>
          <p className="mb-3 text-xs text-stone-500">Ticked and greyed come with the role. Tick others to grant them to this person only — for example payment reversals for one manager.</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {roles.perms.map((p) => {
              const viaRole = fromRole.has(p.slug);
              return (
                <label key={p.slug} className={`flex items-start gap-2 text-sm ${viaRole ? "text-stone-400" : ""}`}>
                  <input type="checkbox" className="mt-0.5 accent-brand-700" disabled={viaRole} checked={viaRole || extra.includes(p.slug)}
                    onChange={(e) => setExtra(e.target.checked ? [...extra, p.slug] : extra.filter((x) => x !== p.slug))} />
                  <span><span className="font-mono text-xs">{p.slug}</span><span className="block text-xs text-stone-500">{p.description}</span></span>
                </label>
              );
            })}
          </div>
        </div>
        <ErrorBox error={act.error} />
        <Button type="submit" busy={act.busy}>Save</Button>
      </form>
    </Modal>
  );
}

function Pending() {
  const act = useAction();
  const roles = useRoles();
  const { data, reload, error } = useLoad(() => q<Row[]>(supabase.rpc("pending_signups")));
  return (
    <Card>
      <ErrorBox error={error ?? act.error} />
      <Table rows={data} empty="No pending sign-ups. Ask new staff to use “New staff member” on the sign-in page." columns={[
        { key: "email", header: "Email", render: (r) => <>{r.email}<span className="block text-xs text-stone-500">{r.full_name}</span></> },
        { key: "created_at", header: "Signed up", render: (r) => date(r.created_at) },
        { key: "confirmed", header: "Email confirmed", render: (r) => <Badge tone={r.confirmed ? "green" : "amber"}>{r.confirmed ? "Yes" : "Not yet"}</Badge> },
        { key: "approve", header: "Give access", render: (r) => (
          <form className="flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            const v = formValues(e.currentTarget);
            await act.run(() => q(supabase.from("staff").insert({ id: r.id, email: r.email, full_name: v.full_name, role: v.role })), () => { reload(); loadLookups(true); });
          }}>
            <Input name="full_name" required defaultValue={r.full_name} placeholder="Full name" className="w-40" />
            <Select name="role" className="w-48">{roles.data?.roles.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}</Select>
            <Button type="submit" busy={act.busy}>Approve</Button>
          </form>) },
      ]} />
    </Card>
  );
}

function Roles() {
  const act = useAction();
  const { data, reload } = useRoles();
  if (!data) return null;
  const has = (role: string, perm: string) => data.rp.some((x) => x.role === role && x.permission === perm);
  async function toggle(role: string, perm: string, on: boolean) {
    await act.run(() => on
      ? q(supabase.from("role_permissions").insert({ role, permission: perm }))
      : q(supabase.from("role_permissions").delete().match({ role, permission: perm })), reload);
  }
  return (
    <Card title="Role permissions">
      <ErrorBox error={act.error} />
      <p className="mb-4 text-sm text-stone-600">Changes apply the next time each person loads the back office. Super Administrator always keeps every permission.</p>
      <div className="-mx-5 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-xs text-stone-500"><th className="px-5 py-2">Permission</th>{data.roles.map((r) => <th key={r.slug} className="px-3 py-2 text-center">{r.name}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {data.perms.map((p) => (
              <tr key={p.slug}>
                <td className="px-5 py-2"><span className="font-mono text-xs">{p.slug}</span><span className="block text-xs text-stone-500">{p.description}</span></td>
                {data.roles.map((r) => (
                  <td key={r.slug} className="px-3 py-2 text-center">
                    <input type="checkbox" className="accent-brand-700" checked={has(r.slug, p.slug)} disabled={r.slug === "super_admin" || act.busy} onChange={(e) => toggle(r.slug, p.slug, e.target.checked)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Audit() {
  const { can } = useAuth();
  const [table, setTable] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const staff = useLoad(() => q<Row[]>(supabase.from("staff").select("id, full_name")));
  const { data, error } = useLoad(async () => {
    if (!can("audit.view")) return [];
    let query = supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(300);
    if (table) query = query.eq("table_name", table);
    return q<Row[]>(query);
  }, [table]);
  const tables = ["properties", "leads", "customers", "transactions", "contracts", "contract_documents", "payment_schedules", "installments", "payments", "payment_allocations", "staff", "staff_permissions", "role_permissions", "settings"];

  return (
    <Card>
      <ErrorBox error={error} />
      <div className="mb-4 max-w-xs"><Select value={table} onChange={(e) => setTable(e.target.value)}><option value="">All records</option>{tables.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</Select></div>
      <Table rows={data} onRowClick={setOpen} columns={[
        { key: "changed_at", header: "When", className: "whitespace-nowrap", render: (r) => dateTime(r.changed_at) },
        { key: "changed_by", header: "Who", render: (r) => staff.data?.find((s) => s.id === r.changed_by)?.full_name ?? (r.changed_by ? "—" : "System / website") },
        { key: "table_name", header: "Record", render: (r) => <>{r.table_name.replace("_", " ")} <span className="text-xs text-stone-500">{(r.new_data ?? r.old_data)?.ref ?? (r.new_data ?? r.old_data)?.receipt_no ?? ""}</span></> },
        { key: "action", header: "Action", render: (r) => <Badge tone={r.action === "delete" ? "red" : r.action === "insert" ? "green" : "blue"}>{r.action}</Badge> },
        { key: "fields", header: "Changed fields", render: (r) => <span className="text-xs text-stone-600">{r.action === "update" ? Object.keys(r.new_data).filter((k) => k !== "updated_at" && JSON.stringify(r.new_data[k]) !== JSON.stringify(r.old_data?.[k])).join(", ") : ""}</span> },
      ]} />
      <Modal title="Change details" open={!!open} onClose={() => setOpen(null)} wide>
        {open && (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead><tr className="border-b text-left text-stone-500"><th className="px-5 py-1.5">Field</th><th className="px-3 py-1.5">Before</th><th className="px-3 py-1.5">After</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {Object.keys({ ...(open.old_data ?? {}), ...(open.new_data ?? {}) }).map((k) => {
                  const before = JSON.stringify(open.old_data?.[k] ?? null);
                  const after = JSON.stringify(open.new_data?.[k] ?? null);
                  return <tr key={k} className={before !== after ? "bg-amber-50" : ""}><td className="px-5 py-1.5 font-mono">{k}</td><td className="max-w-xs break-all px-3 py-1.5">{open.old_data ? before : ""}</td><td className="max-w-xs break-all px-3 py-1.5">{open.new_data ? after : ""}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </Card>
  );
}
