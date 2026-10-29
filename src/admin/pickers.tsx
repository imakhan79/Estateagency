import { useEffect, useState } from "react";
import { q, supabase, type Row } from "./lib";
import { Input } from "./ui";

/** Search-as-you-type picker for customers or properties. Calls onPick with the chosen row. */
export function RecordPicker({ table, onPick, placeholder, initial }: {
  table: "customers" | "properties"; onPick: (row: Row | null) => void; placeholder?: string; initial?: Row | null;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [picked, setPicked] = useState<Row | null>(initial ?? null);

  useEffect(() => {
    if (picked || term.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = term.replace(/[%,()]/g, " ").trim();
    const handle = setTimeout(async () => {
      const query = table === "customers"
        ? supabase.from("customers").select("id, ref, full_name, mobile").or(`full_name.ilike.%${t}%,mobile.ilike.%${t}%,ref.ilike.%${t}%,cnic.ilike.%${t}%`).limit(8)
        : supabase.from("properties").select("id, ref, title, city, area, listing_type, price, currency").or(`title.ilike.%${t}%,ref.ilike.%${t}%,area.ilike.%${t}%`).limit(8);
      setResults(await q<Row[]>(query).catch(() => []));
    }, 250);
    return () => clearTimeout(handle);
  }, [term, table, picked]);

  if (picked) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm">
        <span>{picked.ref} · {picked.full_name ?? picked.title}</span>
        <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => { setPicked(null); onPick(null); }}>Change</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={placeholder ?? (table === "customers" ? "Search name, mobile, CNIC" : "Search title, ref, area")} />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => { setPicked(r); onPick(r); setTerm(""); }}>
                <span className="font-medium">{r.ref}</span> {r.full_name ?? r.title}
                <span className="block text-xs text-stone-500">{r.mobile ?? `${r.area}, ${r.city}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
