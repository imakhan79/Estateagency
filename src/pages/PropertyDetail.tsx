import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bath, BedDouble, Building2, Check, ChevronLeft, ChevronRight, Layers, MapPin, Maximize, MessageCircle, Phone, Share2, Sofa } from "lucide-react";
import { getProperty, getSimilar, images, mediaUrl, useReference, type Property } from "../lib/api";
import { availabilityName, formatPrice, formatSize, furnishingLabel, typeName, useDocumentTitle, waLink } from "../lib/format";
import InquiryForm from "../components/InquiryForm";
import PropertyCard from "../components/PropertyCard";
import NotFound from "./NotFound";

export default function PropertyDetail() {
  const { slug } = useParams();
  const ref = useReference();
  const [p, setP] = useState<Property | null | undefined>(undefined);
  const [similar, setSimilar] = useState<Property[]>([]);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setP(undefined);
    setActive(0);
    getProperty(slug!).then((row) => {
      setP(row);
      if (row) getSimilar(row).then(setSimilar).catch(() => {});
    }).catch(() => setP(null));
  }, [slug]);

  useDocumentTitle(
    p ? `${p.seo_title || p.title} | ${ref?.business.name ?? ""}` : "Property",
    p ? p.seo_description || `${p.title} in ${p.area}, ${p.city}. ${formatPrice(p.price, p.currency, p.listing_type === "rent")}.` : undefined,
  );

  // Structured data for search engines (BRD §4.5 SEO enhancement).
  useEffect(() => {
    if (!p) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: p.title,
      description: p.description,
      url: window.location.href,
      image: images(p).map(mediaUrl),
      datePosted: p.published_at,
      offers: { "@type": "Offer", price: p.price, priceCurrency: p.currency },
      address: { "@type": "PostalAddress", addressLocality: p.city, addressRegion: p.area, addressCountry: "PK" },
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, [p]);

  if (p === undefined) {
    return <div className="container-page py-10"><div className="aspect-[16/9] animate-pulse rounded-2xl bg-stone-200" /></div>;
  }
  if (p === null) return <NotFound />;

  const gallery = images(p);
  const rent = p.listing_type === "rent";
  const business = ref?.business;
  const features = p.property_features.map((pf) => ref?.features.find((f) => f.id === pf.feature_id)?.name).filter(Boolean);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: p!.title, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const facts = [
    { icon: Building2, label: "Type", value: typeName(p, ref) },
    { icon: Maximize, label: "Size", value: formatSize(p, ref) },
    p.bedrooms != null && { icon: BedDouble, label: "Bedrooms", value: p.bedrooms },
    p.bathrooms != null && { icon: Bath, label: "Bathrooms", value: p.bathrooms },
    p.floors != null && { icon: Layers, label: "Floors", value: p.floors },
    p.furnishing && { icon: Sofa, label: "Furnishing", value: furnishingLabel[p.furnishing] },
  ].filter(Boolean) as { icon: typeof Building2; label: string; value: string | number }[];

  return (
    <div className="container-page py-8">
      <Link to={rent ? "/rent" : "/buy"} className="inline-flex items-center gap-1 text-sm font-medium text-stone-600 hover:text-stone-900">
        <ChevronLeft size={16} /> Back to {rent ? "rentals" : "properties for sale"}
      </Link>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_200px]">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-stone-200">
          {gallery[active] && <img src={mediaUrl(gallery[active])} alt={gallery[active].alt ?? p.title} className="h-full w-full object-cover" />}
          {gallery.length > 1 && (
            <>
              <button onClick={() => setActive((active - 1 + gallery.length) % gallery.length)} className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow" aria-label="Previous photo"><ChevronLeft /></button>
              <button onClick={() => setActive((active + 1) % gallery.length)} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow" aria-label="Next photo"><ChevronRight /></button>
              <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{active + 1} / {gallery.length}</span>
            </>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto lg:flex-col">
          {gallery.map((m, i) => (
            <button key={m.id} onClick={() => setActive(i)} className={`aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-xl lg:w-full ${i === active ? "ring-2 ring-brand-600" : "opacity-80 hover:opacity-100"}`}>
              <img src={mediaUrl(m).replace("w=1600", "w=400")} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">{rent ? "For rent" : "For sale"}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.availability === "available" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
              {availabilityName(p.availability, ref)}
            </span>
            <span className="text-xs text-stone-500">Ref {p.ref}</span>
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold text-stone-900 sm:text-4xl">{p.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-stone-600"><MapPin size={16} /> {p.public_address || `${p.area}, ${p.city}`}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="text-3xl font-semibold text-brand-800">{formatPrice(p.price, p.currency, rent)}</p>
            <button onClick={share} className="btn-secondary py-2"><Share2 size={16} /> {copied ? "Link copied" : "Share"}</button>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-3">
            {facts.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <Icon className="shrink-0 text-brand-600" size={22} />
                <div>
                  <dt className="text-xs text-stone-500">{label}</dt>
                  <dd className="font-semibold text-stone-900">{value}</dd>
                </div>
              </div>
            ))}
          </dl>

          <h2 className="mt-10 font-display text-2xl font-semibold text-stone-900">About this property</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-stone-700">{p.description}</p>

          {features.length > 0 && (
            <>
              <h2 className="mt-10 font-display text-2xl font-semibold text-stone-900">Features</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-stone-700"><Check size={18} className="text-brand-600" /> {f}</li>
                ))}
              </ul>
            </>
          )}

          {p.video_urls.length > 0 && (
            <>
              <h2 className="mt-10 font-display text-2xl font-semibold text-stone-900">Video tour</h2>
              <ul className="mt-3 space-y-2">
                {p.video_urls.map((v) => <li key={v}><a href={v} target="_blank" rel="noreferrer" className="text-brand-700 underline">Watch video</a></li>)}
              </ul>
            </>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <p className="text-lg font-semibold text-stone-900">Interested in this property?</p>
            <p className="mt-1 mb-5 text-sm text-stone-600">Send an enquiry or book a viewing. Quote ref {p.ref}.</p>
            <InquiryForm propertyRef={p.ref} defaultType="viewing" types={["viewing", rent ? "rent" : "buy", "general"]} compact />
          </div>
          {business && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <a href={`tel:${business.phone}`} className="btn-secondary"><Phone size={16} /> Call</a>
              <a href={waLink(business.whatsapp, `Hello, I am interested in ${p.title} (ref ${p.ref}). ${window.location.href}`)} target="_blank" rel="noreferrer" className="btn-secondary"><MessageCircle size={16} /> WhatsApp</a>
            </div>
          )}
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold text-stone-900">Similar properties</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((s) => <PropertyCard key={s.id} p={s} refData={ref} />)}
          </div>
        </section>
      )}
    </div>
  );
}
