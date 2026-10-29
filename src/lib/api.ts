import { useEffect, useState } from "react";
import { storageUrl, supabase } from "./supabase";

export type ListingType = "sale" | "rent";

export interface Media {
  id: string;
  kind: "image" | "video";
  storage_path: string | null;
  external_url: string | null;
  alt: string | null;
  sort: number;
}

export interface Property {
  id: string;
  ref: string;
  slug: string;
  title: string;
  description: string;
  category_id: number;
  type_id: number;
  listing_type: ListingType;
  price: number;
  currency: string;
  city: string;
  area: string;
  public_address: string | null;
  size: number;
  size_unit: string;
  bedrooms: number | null;
  bathrooms: number | null;
  floors: number | null;
  furnishing: "furnished" | "semi_furnished" | "unfurnished" | null;
  featured: boolean;
  availability: string;
  video_urls: string[];
  seo_title: string | null;
  seo_description: string | null;
  published_at: string;
  property_media: Media[];
  property_features: { feature_id: number }[];
}

export interface Reference {
  categories: { id: number; slug: string; name: string }[];
  types: { id: number; category_id: number; slug: string; name: string; has_rooms: boolean }[];
  features: { id: number; slug: string; name: string }[];
  units: { code: string; name: string; sqft_factor: number }[];
  availability: { slug: string; name: string }[];
  business: Business;
}

export interface Business {
  name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  about: string;
}

// Only the columns website visitors are allowed to read (see 0006_security.sql).
export const PROPERTY_COLUMNS =
  "id, ref, slug, title, description, category_id, type_id, listing_type, price, currency, city, area, public_address, " +
  "size, size_unit, bedrooms, bathrooms, floors, furnishing, featured, availability, video_urls, seo_title, " +
  "seo_description, published_at, property_media(id, kind, storage_path, external_url, alt, sort), property_features(feature_id)";

export function mediaUrl(m: Media) {
  return m.external_url ?? storageUrl("property-media", m.storage_path!);
}

export function images(p: Property) {
  return p.property_media.filter((m) => m.kind === "image").sort((a, b) => a.sort - b.sort);
}

let referencePromise: Promise<Reference> | null = null;

export function loadReference(): Promise<Reference> {
  referencePromise ??= (async () => {
    const [categories, types, features, units, availability, settings] = await Promise.all([
      supabase.from("property_categories").select("id, slug, name").eq("active", true).order("sort"),
      supabase.from("property_types").select("id, category_id, slug, name, has_rooms").eq("active", true).order("sort"),
      supabase.from("features").select("id, slug, name").eq("active", true).order("sort"),
      supabase.from("area_units").select("code, name, sqft_factor").eq("active", true).order("sort"),
      supabase.from("availability_statuses").select("slug, name").order("sort"),
      supabase.from("settings").select("key, value").eq("key", "business").maybeSingle(),
    ]);
    const err = categories.error ?? types.error ?? features.error ?? units.error ?? availability.error ?? settings.error;
    if (err) throw err;
    return {
      categories: categories.data!,
      types: types.data!,
      features: features.data!,
      units: units.data!,
      availability: availability.data!,
      business: settings.data!.value as Business,
    };
  })();
  referencePromise.catch(() => (referencePromise = null));
  return referencePromise;
}

export function useReference() {
  const [ref, setRef] = useState<Reference | null>(null);
  useEffect(() => {
    loadReference().then(setRef).catch(console.error);
  }, []);
  return ref;
}

export interface SearchFilters {
  listingType?: ListingType;
  q?: string;
  category?: string;
  type?: string;
  city?: string;
  area?: string;
  minPrice?: number;
  maxPrice?: number;
  minSize?: number;
  maxSize?: number;
  sizeUnit?: string;
  beds?: number;
  baths?: number;
  furnishing?: string;
  availability?: string;
  features?: number[];
  sort?: "newest" | "price_asc" | "price_desc";
}

export async function searchProperties(f: SearchFilters, ref: Reference): Promise<Property[]> {
  let query = supabase.from("properties").select(PROPERTY_COLUMNS);

  if (f.listingType) query = query.eq("listing_type", f.listingType);
  if (f.category) {
    const c = ref.categories.find((x) => x.slug === f.category);
    if (c) query = query.eq("category_id", c.id);
  }
  if (f.type) {
    const t = ref.types.find((x) => x.slug === f.type);
    if (t) query = query.eq("type_id", t.id);
  }
  if (f.city) query = query.ilike("city", f.city);
  if (f.area) query = query.ilike("area", `%${f.area}%`);
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,area.ilike.%${term}%,city.ilike.%${term}%,ref.ilike.%${term}%`);
  }
  if (f.minPrice) query = query.gte("price", f.minPrice);
  if (f.maxPrice) query = query.lte("price", f.maxPrice);
  if (f.beds) query = query.gte("bedrooms", f.beds);
  if (f.baths) query = query.gte("bathrooms", f.baths);
  if (f.furnishing) query = query.eq("furnishing", f.furnishing);
  if (f.availability) query = query.eq("availability", f.availability);

  if (f.sort === "price_asc") query = query.order("price", { ascending: true });
  else if (f.sort === "price_desc") query = query.order("price", { ascending: false });
  else query = query.order("published_at", { ascending: false });

  const { data, error } = await query.limit(200);
  if (error) throw error;
  let rows = data as unknown as Property[];

  // Size and features are compared client-side: sizes are stored in mixed units, features via a join table.
  if (f.minSize || f.maxSize) {
    const factor = ref.units.find((u) => u.code === (f.sizeUnit ?? "marla"))?.sqft_factor ?? 1;
    rows = rows.filter((p) => {
      const sqft = p.size * (ref.units.find((u) => u.code === p.size_unit)?.sqft_factor ?? 1);
      return (!f.minSize || sqft >= f.minSize * factor) && (!f.maxSize || sqft <= f.maxSize * factor);
    });
  }
  if (f.features?.length) {
    rows = rows.filter((p) => f.features!.every((id) => p.property_features.some((pf) => pf.feature_id === id)));
  }
  return rows;
}

export async function getProperty(slug: string) {
  const { data, error } = await supabase.from("properties").select(PROPERTY_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as unknown as Property | null;
}

export async function getFeatured(limit = 6) {
  const { data, error } = await supabase
    .from("properties")
    .select(PROPERTY_COLUMNS)
    .eq("featured", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as Property[];
}

export async function getSimilar(p: Property, limit = 3) {
  const { data, error } = await supabase
    .from("properties")
    .select(PROPERTY_COLUMNS)
    .eq("listing_type", p.listing_type)
    .eq("type_id", p.type_id)
    .neq("id", p.id)
    .limit(limit);
  if (error) throw error;
  return data as unknown as Property[];
}

export interface InquiryInput {
  name: string;
  mobile: string;
  inquiryType: "buy" | "rent" | "sell" | "general" | "viewing";
  email?: string;
  message?: string;
  propertyRef?: string;
  preferredContact?: "phone" | "whatsapp" | "email";
  preferredViewingDate?: string;
  details?: Record<string, unknown>;
}

export async function submitInquiry(i: InquiryInput): Promise<string> {
  const { data, error } = await supabase.rpc("submit_inquiry", {
    p_name: i.name,
    p_mobile: i.mobile,
    p_inquiry_type: i.inquiryType,
    p_email: i.email || null,
    p_message: i.message || null,
    p_property_ref: i.propertyRef || null,
    p_preferred_contact: i.preferredContact || null,
    p_preferred_viewing_date: i.preferredViewingDate || null,
    p_details: i.details ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function uploadSubmissionPhoto(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `sell/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("submissions").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}
