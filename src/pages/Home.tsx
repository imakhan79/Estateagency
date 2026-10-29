import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, Handshake, KeyRound, Search, ShieldCheck } from "lucide-react";
import { getFeatured, useReference, type Property } from "../lib/api";
import { useDocumentTitle } from "../lib/format";
import PropertyCard from "../components/PropertyCard";

export default function Home() {
  const ref = useReference();
  const navigate = useNavigate();
  const [featured, setFeatured] = useState<Property[] | null>(null);
  const [mode, setMode] = useState<"sale" | "rent">("sale");

  useDocumentTitle(ref ? `${ref.business.name} — Property for sale and rent in Pakistan` : "Property for sale and rent", ref?.business.tagline);

  useEffect(() => {
    getFeatured(6).then(setFeatured).catch(() => setFeatured([]));
  }, []);

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "city", "type", "maxPrice"]) {
      const v = String(form.get(key) ?? "").trim();
      if (v) params.set(key, v);
    }
    navigate(`/${mode === "sale" ? "buy" : "rent"}?${params}`);
  }

  const cities = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar"];

  return (
    <>
      <section className="relative isolate overflow-hidden bg-brand-900">
        <img
          src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=2000&q=80&auto=format&fit=crop"
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-900 via-brand-900/80 to-brand-900/30" />
        <div className="container-page py-20 sm:py-28">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-400">Buy · Sell · Rent</p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl leading-tight text-white sm:text-6xl">
            Find the right property, with people you can trust.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-brand-100">
            Verified homes, plots and commercial property across Pakistan, with one agent from first call to handover.
          </p>

          <form onSubmit={onSearch} className="mt-10 max-w-4xl rounded-2xl bg-white p-3 shadow-2xl">
            <div className="mb-3 flex gap-1 px-1">
              {(["sale", "rent"] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${mode === m ? "bg-brand-700 text-white" : "text-stone-600 hover:bg-stone-100"}`}
                >
                  {m === "sale" ? "Buy" : "Rent"}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <input name="q" className="input" placeholder="Area, society or keyword" aria-label="Keyword" />
              <select name="city" className="input" aria-label="City" defaultValue="">
                <option value="">Any city</option>
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select name="type" className="input" aria-label="Property type" defaultValue="">
                <option value="">Any type</option>
                {ref?.types.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </select>
              <button className="btn-primary px-6"><Search size={18} /> Search</button>
            </div>
          </form>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl text-stone-900">Featured properties</h2>
            <p className="mt-2 text-stone-600">Hand-picked listings our agents recommend this week.</p>
          </div>
          <Link to="/search" className="hidden items-center gap-1 text-sm font-semibold text-brand-700 hover:underline sm:flex">
            View all <ArrowRight size={16} />
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured === null
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-96 animate-pulse rounded-2xl bg-stone-200" />)
            : featured.map((p) => <PropertyCard key={p.id} p={p} refData={ref} />)}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container-page">
          <h2 className="text-center font-display text-3xl text-stone-900">How we help</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { icon: Search, title: "Buying", text: "Tell us what you need and your budget. We shortlist verified properties and arrange viewings at times that suit you.", to: "/buy" },
              { icon: KeyRound, title: "Renting", text: "Homes and offices for rent with clear terms, proper agreements and reminders before renewal.", to: "/rent" },
              { icon: Handshake, title: "Selling", text: "Free valuation, professional photos and serious buyers. We handle negotiation, paperwork and payment tracking.", to: "/sell" },
            ].map(({ icon: Icon, title, text, to }) => (
              <Link key={title} to={to} className="group rounded-2xl border border-stone-200 p-7 transition hover:border-brand-600">
                <Icon className="text-brand-600" size={32} />
                <h3 className="mt-4 text-lg font-semibold text-stone-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 group-hover:underline">
                  Learn more <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="grid items-center gap-10 rounded-3xl bg-brand-800 p-8 text-white sm:p-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl">Thinking of selling or renting out?</h2>
            <p className="mt-3 text-brand-100">
              Send us your property details. An agent will visit, advise on price and list it once it has been checked.
            </p>
            <Link to="/sell" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-brand-900 hover:bg-gold-400">
              Submit your property <ArrowRight size={16} />
            </Link>
          </div>
          <ul className="space-y-4">
            {[
              [BadgeCheck, "Every listing checked before it goes live"],
              [ShieldCheck, "Written agreements and documented payments"],
              [Handshake, "One agent from first call to handover"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof BadgeCheck;
              return (
                <li key={text as string} className="flex items-center gap-3 text-brand-50">
                  <I className="shrink-0 text-gold-400" /> {text as string}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
