import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export { supabase };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export function money(amount: number | string | null | undefined, currency = "PKR") {
  if (amount == null || amount === "") return "—";
  return `${currency} ${Number(amount).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

export function date(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const today = () => new Date().toISOString().slice(0, 10);

export function label(slug: string | null | undefined) {
  if (!slug) return "—";
  return slug.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/** Runs an async loader and re-runs it when deps change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return run()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [run]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Unwraps a Supabase response, throwing its error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = any>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export interface Lookups {
  categories: Row[];
  types: Row[];
  features: Row[];
  units: Row[];
  availability: Row[];
  sources: Row[];
  partyCategories: Row[];
  leadStatuses: Row[];
  txStatuses: Row[];
  contractTypes: Row[];
  contractStatuses: Row[];
  transitions: Row[];
  currencies: Row[];
  staff: Row[];
  branches: Row[];
}

let lookupsPromise: Promise<Lookups> | null = null;

export function loadLookups(force = false): Promise<Lookups> {
  if (force) lookupsPromise = null;
  lookupsPromise ??= (async () => {
    const t = (name: string, order = "id") => q(supabase.from(name).select("*").order(order));
    const [categories, types, features, units, availability, sources, partyCategories, leadStatuses, txStatuses,
      contractTypes, contractStatuses, transitions, currencies, staff, branches] = await Promise.all([
      t("property_categories", "sort"), t("property_types", "sort"), t("features", "sort"), t("area_units", "sort"),
      t("availability_statuses", "sort"), t("lead_sources"), t("party_categories"), t("lead_statuses", "sort"),
      t("transaction_statuses", "sort"), t("contract_types"), t("contract_statuses", "sort"),
      q(supabase.from("contract_status_transitions").select("*")), t("currencies", "code"),
      q(supabase.from("staff").select("id, full_name, email, role, active, branch_id").order("full_name")),
      t("branches"),
    ]);
    return { categories, types, features, units, availability, sources, partyCategories, leadStatuses, txStatuses,
      contractTypes, contractStatuses, transitions, currencies, staff, branches };
  })();
  lookupsPromise.catch(() => (lookupsPromise = null));
  return lookupsPromise;
}

export function useLookups() {
  const [l, setL] = useState<Lookups | null>(null);
  useEffect(() => {
    loadLookups().then(setL).catch(console.error);
  }, []);
  return l;
}

export const nameOf = (rows: Row[] | undefined, id: unknown, key = "id", field = "name") =>
  rows?.find((r) => r[key] === id)?.[field] ?? "—";

export async function signedUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export function fileExt(name: string) {
  return (name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
}
