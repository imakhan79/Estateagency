import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Mail, MapPin, Menu, MessageCircle, Phone, X } from "lucide-react";
import { useReference } from "../lib/api";
import { waLink } from "../lib/format";

const nav = [
  { to: "/buy", label: "Buy" },
  { to: "/rent", label: "Rent" },
  { to: "/sell", label: "Sell" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export default function Layout() {
  const ref = useReference();
  const business = ref?.business;
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-9 w-9" />
            <span className="font-display text-xl font-semibold text-brand-900">{business?.name ?? " "}</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition ${isActive ? "text-brand-700" : "text-stone-600 hover:text-stone-900"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
            {business && (
              <a href={`tel:${business.phone}`} className="btn-primary ml-3 py-2">
                <Phone size={16} /> {business.phone}
              </a>
            )}
          </nav>
          <button className="rounded-md p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <nav className="border-t border-stone-200 bg-white md:hidden">
            <div className="container-page flex flex-col py-2">
              {nav.map((n) => (
                <NavLink key={n.to} to={n.to} className="py-3 text-base font-medium text-stone-700">
                  {n.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-20 bg-brand-900 text-brand-100">
        <div className="container-page grid gap-10 py-14 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-display text-2xl text-white">{business?.name}</p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-brand-100/80">{business?.tagline}</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-gold-400">Explore</p>
            <ul className="space-y-2 text-sm">
              <li><Link to="/buy" className="hover:text-white">Properties for sale</Link></li>
              <li><Link to="/rent" className="hover:text-white">Properties for rent</Link></li>
              <li><Link to="/sell" className="hover:text-white">Sell your property</Link></li>
              <li><Link to="/about" className="hover:text-white">About us</Link></li>
            </ul>
          </div>
          {business && (
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-gold-400">Contact</p>
              <ul className="space-y-2.5 text-sm">
                <li className="flex gap-2"><Phone size={16} className="mt-0.5 shrink-0" /><a href={`tel:${business.phone}`}>{business.phone}</a></li>
                <li className="flex gap-2"><MessageCircle size={16} className="mt-0.5 shrink-0" /><a href={waLink(business.whatsapp)}>{business.whatsapp}</a></li>
                <li className="flex gap-2"><Mail size={16} className="mt-0.5 shrink-0" /><a href={`mailto:${business.email}`} className="break-all">{business.email}</a></li>
                <li className="flex gap-2"><MapPin size={16} className="mt-0.5 shrink-0" />{business.address}</li>
              </ul>
            </div>
          )}
        </div>
        <div className="border-t border-white/10">
          <div className="container-page flex flex-col gap-2 py-5 text-xs text-brand-100/70 sm:flex-row sm:justify-between">
            <p>© {new Date().getFullYear()} {business?.name}. All rights reserved.</p>
            <p className="flex gap-4">
              <Link to="/privacy" className="hover:text-white">Privacy policy</Link>
              <Link to="/terms" className="hover:text-white">Terms and conditions</Link>
            </p>
          </div>
        </div>
      </footer>

      {business && (
        <a
          href={waLink(business.whatsapp, "Hello, I would like to ask about a property.")}
          className="fixed right-4 bottom-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105"
          aria-label="Chat on WhatsApp"
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={26} />
        </a>
      )}
    </div>
  );
}
