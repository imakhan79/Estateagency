import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Bell, Building2, FileSignature, Handshake, Home, LayoutDashboard, LogOut, Menu, Percent, Settings, UserCog, Users, Wallet, X,
} from "lucide-react";
import { AuthProvider, useAuth } from "./auth";
import { dateTime, supabase, useLoad, type Row } from "./lib";
import { Button, ErrorBox, Field, Input, Spinner } from "./ui";
import Dashboard from "./pages/Dashboard";
import PropertyList from "./pages/PropertyList";
import PropertyEdit from "./pages/PropertyEdit";
import LeadList from "./pages/LeadList";
import LeadDetail from "./pages/LeadDetail";
import CustomerList from "./pages/CustomerList";
import CustomerDetail from "./pages/CustomerDetail";
import TransactionList from "./pages/TransactionList";
import TransactionDetail from "./pages/TransactionDetail";
import ContractList from "./pages/ContractList";
import ContractDetail from "./pages/ContractDetail";
import ScheduleList from "./pages/ScheduleList";
import ScheduleDetail from "./pages/ScheduleDetail";
import Receipt from "./pages/Receipt";
import Reports from "./pages/Reports";
import Commissions from "./pages/Commissions";
import SettingsPage from "./pages/Settings";
import UsersPage from "./pages/Users";

export default function AdminApp() {
  useEffect(() => {
    document.title = "Admin";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="receipt/:id" element={<Guard><Receipt /></Guard>} />
        <Route element={<Guard><Shell /></Guard>}>
          <Route index element={<Dashboard />} />
          <Route path="properties" element={<PropertyList />} />
          <Route path="properties/:id" element={<PropertyEdit />} />
          <Route path="leads" element={<LeadList />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="customers" element={<CustomerList />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="transactions" element={<TransactionList />} />
          <Route path="transactions/:id" element={<TransactionDetail />} />
          <Route path="contracts" element={<ContractList />} />
          <Route path="contracts/:id" element={<ContractDetail />} />
          <Route path="payments" element={<ScheduleList />} />
          <Route path="payments/:id" element={<ScheduleDetail />} />
          <Route path="commissions" element={<Commissions />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  const { loading, session, staff, signOut } = useAuth();
  if (loading) return <div className="min-h-screen bg-stone-50"><Spinner /></div>;
  if (!session) return <Navigate to="/admin/login" replace />;
  if (!staff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
        <div className="max-w-md rounded-xl border border-stone-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold">Waiting for access</h1>
          <p className="mt-2 text-sm text-stone-600">
            You are signed in as {session.user.email}, but an administrator has not given this account a staff role yet,
            or it has been deactivated.
          </p>
          <Button variant="secondary" className="mt-6" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

// Demo sign-in buttons (accounts made by `npm run db:demo-users`). Turn off with VITE_DEMO_LOGINS=false before real data goes in.
const DEMO_LOGINS = import.meta.env.VITE_DEMO_LOGINS === "true";
const DEMO_PASSWORD = "Demo@2026!";
const DEMO_USERS = [
  { label: "Super Admin", email: "superadmin@demo.local" },
  { label: "Manager", email: "manager@demo.local" },
  { label: "Property Manager", email: "property@demo.local" },
  { label: "Sales / Rental Agent", email: "agent@demo.local" },
  { label: "Finance Officer", email: "finance@demo.local" },
  { label: "Legal Officer", email: "legal@demo.local" },
];

function Login() {
  const { session, staff, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Always land on the dashboard after signing in.
    if (!loading && session && staff) navigate("/admin", { replace: true });
  }, [loading, session, staff, navigate]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim();
    const password = String(f.get("password") ?? "");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: String(f.get("name")).trim() }, emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        setNotice("Account created. Confirm your email, then ask an administrator to give you access.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin/settings?tab=account` });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <img src="/favicon.svg" alt="" className="h-10 w-10" />
        <h1 className="mt-4 text-xl font-semibold text-stone-900">
          {mode === "signin" ? "Staff sign in" : mode === "signup" ? "Create staff account" : "Reset password"}
        </h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "signup" && <Field label="Full name"><Input name="name" required autoComplete="name" /></Field>}
          <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
          {mode !== "reset" && (
            <Field label="Password">
              <Input name="password" type="password" required minLength={mode === "signup" ? 10 : 1} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            </Field>
          )}
          <ErrorBox error={error} />
          {notice && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
          <Button type="submit" busy={busy} className="w-full">
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </Button>
        </form>
        {DEMO_LOGINS && mode === "signin" && (
          <div className="mt-6 border-t border-stone-200 pt-5">
            <p className="text-sm font-medium text-stone-900">Demo accounts</p>
            <p className="mb-3 text-xs text-stone-500">One click signs in as each role. Password for all: <code className="rounded bg-stone-100 px-1">{DEMO_PASSWORD}</code></p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map((u) => (
                <button key={u.email} type="button" disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    const { error } = await supabase.auth.signInWithPassword({ email: u.email, password: DEMO_PASSWORD });
                    if (error) setError(error.message);
                    setBusy(false);
                  }}
                  className="rounded-lg border border-stone-300 px-3 py-2 text-left text-sm hover:border-brand-600 hover:bg-brand-50 disabled:opacity-50">
                  <span className="block font-medium text-stone-900">{u.label}</span>
                  <span className="block truncate text-xs text-stone-500">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-between text-sm">
          {mode !== "signin"
            ? <button className="text-brand-700 hover:underline" onClick={() => setMode("signin")}>Back to sign in</button>
            : <>
                <button className="text-brand-700 hover:underline" onClick={() => setMode("reset")}>Forgot password?</button>
                <button className="text-brand-700 hover:underline" onClick={() => setMode("signup")}>New staff member</button>
              </>}
        </div>
      </div>
    </div>
  );
}

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/properties", label: "Properties", icon: Building2, any: ["properties.view", "properties.view_assigned"] },
  { to: "/admin/leads", label: "Leads", icon: Users, any: ["leads.view_all", "leads.view_assigned"] },
  { to: "/admin/customers", label: "Customers", icon: UserCog, any: ["customers.view"] },
  { to: "/admin/transactions", label: "Sales & purchases", icon: Handshake, any: ["transactions.view", "transactions.view_own"] },
  { to: "/admin/contracts", label: "Contracts", icon: FileSignature, any: ["contracts.view", "contracts.view_own"] },
  { to: "/admin/payments", label: "Payments", icon: Wallet, any: ["payments.view"] },
  { to: "/admin/commissions", label: "Commissions", icon: Percent, any: ["commissions.view", "commissions.view_own"] },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, any: ["reports.view"] },
  { to: "/admin/users", label: "Users", icon: Users, any: ["users.manage"] },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function Shell() {
  const { staff, can, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const items = nav.filter((n) => !n.any || n.any.some(can));
  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link to="/admin" className="flex items-center gap-2 px-5 py-5">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <span className="font-semibold text-white">Back office</span>
      </Link>
      <div className="flex-1 space-y-0.5 px-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-white/10 text-white" : "text-brand-100/80 hover:bg-white/5 hover:text-white"}`}>
            <Icon size={18} /> {label}
          </NavLink>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-100/80 hover:text-white"><Home size={18} /> View website</a>
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-100/80 hover:text-white"><LogOut size={18} /> Sign out</button>
        <p className="truncate px-3 pt-2 text-xs text-brand-100/60">{staff?.full_name}</p>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <aside className="fixed inset-y-0 left-0 hidden w-60 bg-brand-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 bg-brand-900">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone-200 bg-white px-4 sm:px-6">
          <button className="rounded p-1.5 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
          <div className="flex-1" />
          <Notifications />
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}

const entityPath: Record<string, string> = {
  lead: "/admin/leads/", contract: "/admin/contracts/", transaction: "/admin/transactions/",
};

function Notifications() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data, reload } = useLoad(async () => {
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
    return (data ?? []) as Row[];
  });
  useEffect(() => {
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
  }, [reload]);

  const unread = data?.filter((n) => !n.read_at).length ?? 0;

  async function openItem(n: Row) {
    if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    setOpen(false);
    reload();
    if (n.entity_type === "installment") {
      const { data: i } = await supabase.from("installments").select("schedule_id").eq("id", n.entity_id).maybeSingle();
      if (i) navigate(`/admin/payments/${i.schedule_id}`);
    } else if (n.entity_type === "activity") {
      const { data: a } = await supabase.from("activities").select("lead_id, customer_id").eq("id", n.entity_id).maybeSingle();
      if (a?.lead_id) navigate(`/admin/leads/${a.lead_id}`);
      else if (a?.customer_id) navigate(`/admin/customers/${a.customer_id}`);
    } else if (entityPath[n.entity_type]) {
      navigate(entityPath[n.entity_type] + n.entity_id);
    }
  }

  async function markAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    reload();
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-full p-2 text-stone-600 hover:bg-stone-100" aria-label="Notifications">
        <Bell size={20} />
        {unread > 0 && <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-stone-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && <button onClick={markAll} className="text-xs text-brand-700 hover:underline">Mark all read</button>}
          </div>
          <ul className="max-h-[60vh] divide-y divide-stone-100 overflow-y-auto">
            {data?.length === 0 && <li className="p-6 text-center text-sm text-stone-500">You're all caught up.</li>}
            {data?.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className={`block w-full px-4 py-3 text-left hover:bg-stone-50 ${n.read_at ? "" : "bg-brand-50/50"}`}>
                  <p className="text-sm font-medium text-stone-900">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-stone-600">{n.body}</p>}
                  <p className="mt-1 text-xs text-stone-400">{dateTime(n.created_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
