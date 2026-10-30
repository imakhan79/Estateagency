import { Link } from "react-router-dom";
import { Bath, BedDouble, MapPin, Maximize } from "lucide-react";
import { images, mediaUrl, type Property, type Reference } from "../lib/api";
import { availabilityName, formatPrice, formatSize, typeName } from "../lib/format";

export default function PropertyCard({ p, refData }: { p: Property; refData: Reference | null }) {
  const img = images(p)[0];
  const features = p.property_features
    .slice(0, 3)
    .map((pf) => refData?.features.find((f) => f.id === pf.feature_id)?.name)
    .filter(Boolean);

  return (
    <Link
      to={`/property/${p.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-stone-900/5"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {img && (
          <img
            src={mediaUrl(img).replace("w=1600", "w=800")}
            alt={img.alt ?? p.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-brand-800">
            {p.listing_type === "rent" ? "For rent" : "For sale"}
          </span>
          {p.availability !== "available" && (
            <span className="rounded-full bg-crimson-500 px-3 py-1 text-xs font-semibold text-white">
              {availabilityName(p.availability, refData)}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xl font-semibold text-brand-800">{formatPrice(p.price, p.currency, p.listing_type === "rent")}</p>
        <h3 className="mt-1 line-clamp-2 font-medium text-stone-900">{p.title}</h3>
        <p className="mt-1.5 flex items-center gap-1 text-sm text-stone-500">
          <MapPin size={14} /> {p.area}, {p.city}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-stone-100 pt-4 text-sm text-stone-600">
          {p.bedrooms != null && (
            <span className="flex items-center gap-1.5"><BedDouble size={16} /> {p.bedrooms} bed</span>
          )}
          {p.bathrooms != null && (
            <span className="flex items-center gap-1.5"><Bath size={16} /> {p.bathrooms} bath</span>
          )}
          <span className="flex items-center gap-1.5"><Maximize size={16} /> {formatSize(p, refData)}</span>
        </div>
        {features.length > 0 && (
          <p className="mt-2 text-xs text-stone-500">{typeName(p, refData)} · {features.join(" · ")}</p>
        )}
      </div>
    </Link>
  );
}
