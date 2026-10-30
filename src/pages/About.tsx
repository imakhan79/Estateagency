import { Link } from "react-router-dom";
import { BadgeCheck, FileText, Handshake, Wallet } from "lucide-react";
import { useReference } from "../lib/api";
import { useDocumentTitle } from "../lib/format";

export default function About() {
  const ref = useReference();
  const b = ref?.business;
  useDocumentTitle(`About us${b ? ` | ${b.name}` : ""}`);

  return (
    <>
      <section className="bg-brand-900 py-20 text-white">
        <div className="container-page max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-crimson-400">About us</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">{b?.name}</h1>
          <p className="mt-5 text-lg leading-relaxed text-brand-100">{b?.about}</p>
        </div>
      </section>
      <section className="container-page py-16">
        <h2 className="font-display text-3xl font-semibold text-stone-900">How we work</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [BadgeCheck, "Verified listings", "We check ownership documents and visit every property before it is published."],
            [Handshake, "One agent throughout", "The same person handles your enquiry, viewings and negotiation."],
            [FileText, "Proper agreements", "Sales and rentals are documented, with renewal reminders before contracts expire."],
            [Wallet, "Clear payments", "Every payment gets a numbered receipt and you always know the remaining balance."],
          ].map(([Icon, title, text]) => {
            const I = Icon as typeof BadgeCheck;
            return (
              <div key={title as string} className="rounded-2xl border border-stone-200 bg-white p-6">
                <I className="text-brand-600" size={28} />
                <h3 className="mt-4 font-semibold text-stone-900">{title as string}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{text as string}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-12 flex flex-wrap gap-3">
          <Link to="/search" className="btn-primary">Browse properties</Link>
          <Link to="/contact" className="btn-secondary">Contact us</Link>
        </div>
      </section>
    </>
  );
}
