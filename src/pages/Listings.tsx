import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { searchProperties, useReference, type ListingType, type Property, type SearchFilters } from "../lib/api";
import { useDocumentTitle } from "../lib/format";
import PropertyCard from "../components/PropertyCard";

const num = (v: string | null) => (v && !Number.isNaN(Number(v)) ? Number(v) : undefined);

export default function Listings({ listingType }: { listingType?: ListingType }) {
  const ref = useReference();
  const [params, setParams] = useSearchParams();
  const [results, setResults] = useState<Property[] | null>(null);
  const [error, setError] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const effectiveType = listingType ?? ((params.get("for") as ListingType) || undefined);
  const heading = effectiveType === "rent" ? "Properties for rent" : effectiveType === "sale" ? "Properties for sale" : "Search properties";
  useDocumentTitle(`${heading}${ref ? ` | ${ref.business.name}` : ""}`);

  const filters: SearchFilters = useMemo(
    () => ({
      listingType: effectiveType,
      q: params.get("q") ?? undefined,
      category: params.get("category") ?? undefined,
      type: params.get("type") ?? undefined,
      city: params.get("city") ?? undefined,
      area: params.get("area") ?? undefined,
      minPrice: num(params.get("minPrice")),
      maxPrice: num(params.get("maxPrice")),
      minSize: num(params.get("minSize")),
      maxSize: num(params.get("maxSize")),
      sizeUnit: params.get("unit") ?? "marla",
      beds: num(params.get("beds")),
      baths: num(params.get("baths")),
      furnishing: params.get("furnishing") ?? undefined,
      availability: params.get("availability") ?? undefined,
      features: params.getAll("feature").map(Number).filter(Boolean),
      sort: (params.get("sort") as SearchFilters["sort"]) ?? "newest",
    }),
    [params, effectiveType],
  );

  useEffect(() => {
    if (!ref) return;
    setResults(null);
    setError(false);
    searchProperties(filters, ref).then(setResults).catch(() => setError(true));
  }, [filters, ref]);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function toggleFeature(id: number) {
    const next = new URLSearchParams(params);
    const current = next.getAll("feature");
    next.delete("feature");
    const updated = current.includes(String(id)) ? current.filter((f) => f !== String(id)) : [...current, String(id)];
    updated.forEach((f) => next.append("feature", f));
    setParams(next, { replace: true });
  }

  const activeCount = [...params.keys()].filter((k) => k !== "sort").length;
  const typesForCategory = ref?.types.filter((t) => !filters.category || ref.categories.find((c) => c.slug === filters.category)?.id === t.category_id);
  const priceSteps = effectiveType === "rent"
    ? [25000, 50000, 100000, 200000, 350000, 500000, 1000000]
    : [5000000, 10000000, 20000000, 40000000, 75000000, 100000000, 200000000];
  const priceLabel = (v: number) => (v >= 10000000 ? `${v / 10000000} Crore` : `${v / 100000} Lakh`);

  const filterPanel = ref && (
    <div className="space-y-5">
      {!listingType && (
        <div>
          <label className="label">Purpose</label>
          <select className="input" value={params.get("for") ?? ""} onChange={(e) => set("for", e.target.value)}>
            <option value="">Buy or rent</option>
            <option value="sale">For sale</option>
            <option value="rent">For rent</option>
          </select>
        </div>
      )}
      <div>
        <label className="label">Keyword</label>
        <input className="input" defaultValue={filters.q} placeholder="Area, society, reference" onBlur={(e) => set("q", e.target.value.trim())} onKeyDown={(e) => e.key === "Enter" && set("q", e.currentTarget.value.trim())} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">City</label>
          <input className="input" defaultValue={filters.city} placeholder="Any" onBlur={(e) => set("city", e.target.value.trim())} />
        </div>
        <div>
          <label className="label">Area</label>
          <input className="input" defaultValue={filters.area} placeholder="Any" onBlur={(e) => set("area", e.target.value.trim())} />
        </div>
      </div>
      <div>
        <label className="label">Category</label>
        <select className="input" value={filters.category ?? ""} onChange={(e) => { const n = new URLSearchParams(params); e.target.value ? n.set("category", e.target.value) : n.delete("category"); n.delete("type"); setParams(n, { replace: true }); }}>
          <option value="">All categories</option>
          {ref.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Property type</label>
        <select className="input" value={filters.type ?? ""} onChange={(e) => set("type", e.target.value)}>
          <option value="">All types</option>
          {typesForCategory?.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Min price</label>
          <select className="input" value={params.get("minPrice") ?? ""} onChange={(e) => set("minPrice", e.target.value)}>
            <option value="">No min</option>
            {priceSteps.map((v) => <option key={v} value={v}>{priceLabel(v)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Max price</label>
          <select className="input" value={params.get("maxPrice") ?? ""} onChange={(e) => set("maxPrice", e.target.value)}>
            <option value="">No max</option>
            {priceSteps.map((v) => <option key={v} value={v}>{priceLabel(v)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Size</label>
        <div className="grid grid-cols-3 gap-2">
          <input className="input" type="number" min={0} placeholder="Min" defaultValue={params.get("minSize") ?? ""} onBlur={(e) => set("minSize", e.target.value)} />
          <input className="input" type="number" min={0} placeholder="Max" defaultValue={params.get("maxSize") ?? ""} onBlur={(e) => set("maxSize", e.target.value)} />
          <select className="input px-2" value={filters.sizeUnit} onChange={(e) => set("unit", e.target.value)}>
            {ref.units.map((u) => <option key={u.code} value={u.code}>{u.code === "sqft" ? "sq ft" : u.code === "sqyd" ? "sq yd" : u.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Bedrooms</label>
          <select className="input" value={params.get("beds") ?? ""} onChange={(e) => set("beds", e.target.value)}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </div>
        <div>
          <label className="label">Bathrooms</label>
          <select className="input" value={params.get("baths") ?? ""} onChange={(e) => set("baths", e.target.value)}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Furnishing</label>
          <select className="input" value={filters.furnishing ?? ""} onChange={(e) => set("furnishing", e.target.value)}>
            <option value="">Any</option>
            <option value="furnished">Furnished</option>
            <option value="semi_furnished">Semi-furnished</option>
            <option value="unfurnished">Unfurnished</option>
          </select>
        </div>
        <div>
          <label className="label">Availability</label>
          <select className="input" value={filters.availability ?? ""} onChange={(e) => set("availability", e.target.value)}>
            <option value="">Any</option>
            {ref.availability.filter((a) => ["available", "reserved", "under_offer"].includes(a.slug)).map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">Features</legend>
        <div className="flex flex-wrap gap-2">
          {ref.features.map((f) => {
            const on = filters.features?.includes(f.id);
            return (
              <button type="button" key={f.id} onClick={() => toggleFeature(f.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-stone-300 text-stone-600 hover:border-stone-400"}`}>
                {f.name}
              </button>
            );
          })}
        </div>
      </fieldset>
      {activeCount > 0 && (
        <button className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => setParams({}, { replace: true })}>
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-stone-900 sm:text-4xl">{heading}</h1>
          <p className="mt-1 text-stone-600">{results ? `${results.length} ${results.length === 1 ? "property" : "properties"} found` : "Searching…"}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary lg:hidden" onClick={() => setShowFilters(true)}>
            <SlidersHorizontal size={16} /> Filters{activeCount ? ` (${activeCount})` : ""}
          </button>
          <select className="input w-auto" value={filters.sort} onChange={(e) => set("sort", e.target.value)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="price_asc">Lowest price</option>
            <option value="price_desc">Highest price</option>
          </select>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[300px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-stone-200 bg-white p-5">{filterPanel}</div>
        </aside>

        {showFilters && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
            <div className="relative ml-auto h-full w-full max-w-sm overflow-y-auto bg-white p-5">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-lg font-semibold">Filters</p>
                <button onClick={() => setShowFilters(false)} aria-label="Close filters"><X /></button>
              </div>
              {filterPanel}
              <button className="btn-primary mt-6 w-full" onClick={() => setShowFilters(false)}>Show results</button>
            </div>
          </div>
        )}

        <div>
          {error && <p className="rounded-xl bg-red-50 p-6 text-red-700">We could not load properties right now. Please try again shortly.</p>}
          {results && results.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
              <p className="text-lg font-semibold text-stone-900">No properties match your search</p>
              <p className="mt-2 text-stone-600">Try removing a filter, or tell us what you are looking for and we will contact you when something comes up.</p>
              <a href="/contact" className="btn-primary mt-6">Tell us your requirements</a>
            </div>
          )}
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {results === null && !error
              ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-96 animate-pulse rounded-2xl bg-stone-200" />)
              : results?.map((p) => <PropertyCard key={p.id} p={p} refData={ref} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
