import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { Loader2, X } from "lucide-react";

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && <Link to={back.to} className="text-sm text-stone-500 hover:text-stone-800">← {back.label}</Link>}
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-stone-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-3">
          <h2 className="font-semibold text-stone-900">{title}</h2>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-stone-600 hover:bg-stone-100",
};

export function Button({ variant = "primary", busy, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ to, children, variant = "secondary" }: { to: string; children: ReactNode; variant?: Variant }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${variants[variant]}`}>
      {children}
    </Link>
  );
}

const tones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  gray: "bg-stone-100 text-stone-700 ring-stone-500/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

const statusTone: Record<string, string> = {
  available: "green", published: "green", active: "green", paid: "green", approved: "green", completed: "green", won: "green", delivered: "green", renewed: "blue",
  reserved: "amber", under_offer: "amber", under_review: "amber", pending: "amber", due: "amber", partially_paid: "amber", expiring_soon: "amber", pending_signature: "amber", draft: "gray", scheduled: "blue",
  sold: "purple", rented: "purple", archived: "gray", unpublished: "gray", withdrawn: "gray", upcoming: "blue",
  overdue: "red", expired: "red", cancelled: "gray", terminated: "gray", rejected: "red", lost: "red", disputed: "red", failed: "red", termination_in_progress: "red",
  high: "red", medium: "amber", low: "gray",
};

export function Badge({ children, tone, status }: { children?: ReactNode; tone?: keyof typeof tones; status?: string | null }) {
  const t = tone ?? (status ? statusTone[status] : undefined) ?? "gray";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[t]}`}>
      {children ?? (status ? status.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—")}
    </span>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Table<T extends Record<string, any>>({ columns, rows, onRowClick, empty = "Nothing here yet.", rowKey = "id" }: {
  columns: Column<T>[]; rows: T[] | null | undefined; onRowClick?: (row: T) => void; empty?: ReactNode; rowKey?: string;
}) {
  if (!rows) return <Spinner />;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-stone-500">{empty}</p>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
            {columns.map((c) => <th key={c.key} className={`px-5 py-2.5 ${c.className ?? ""}`}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r, i) => (
            <tr key={String(r[rowKey] ?? i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? "cursor-pointer hover:bg-stone-50" : ""}>
              {columns.map((c) => (
                <td key={c.key} className={`px-5 py-3 align-top ${c.className ?? ""}`}>{c.render ? c.render(r) : String(r[c.key] ?? "—")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-10 text-stone-400"><Loader2 className="animate-spin" /></div>;
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
}

export function Modal({ title, open, onClose, children, wide }: { title: ReactNode; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10" onMouseDown={onClose}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl bg-white shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h2 className="font-semibold text-stone-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className = "" }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-stone-50";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ""}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className ?? ""}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={`${inputCls} ${p.className ?? ""}`} />;

export function Stat({ label, value, tone, to }: { label: string; value: ReactNode; tone?: "red" | "amber" | "green"; to?: string }) {
  const color = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : tone === "green" ? "text-emerald-700" : "text-stone-900";
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </>
  );
  return to
    ? <Link to={to} className="rounded-xl border border-stone-200 bg-white p-4 transition hover:border-brand-600">{body}</Link>
    : <div className="rounded-xl border border-stone-200 bg-white p-4">{body}</div>;
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: ReactNode }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-stone-200">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === t.key ? "border-brand-700 text-brand-800" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function DL({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt className="text-xs text-stone-500">{k}</dt>
          <dd className="text-sm text-stone-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Button that runs an async action, shows its error, and calls onDone. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, onDone?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

/** Builds an object from a form, turning empty strings into null. */
export function formValues(form: HTMLFormElement) {
  const out: Record<string, string | null> = {};
  new FormData(form).forEach((v, k) => {
    if (typeof v === "string") out[k] = v.trim() === "" ? null : v.trim();
  });
  return out;
}
