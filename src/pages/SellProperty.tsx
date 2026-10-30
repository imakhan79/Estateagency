import { useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardCheck, Home, Users } from "lucide-react";
import { submitInquiry, uploadSubmissionPhoto, useReference } from "../lib/api";
import { useDocumentTitle } from "../lib/format";

const MAX_PHOTOS = 6;

export default function SellProperty() {
  const ref = useReference();
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [leadRef, setLeadRef] = useState("");
  useDocumentTitle(`Sell or let your property${ref ? ` | ${ref.business.name}` : ""}`);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const files = (form.getAll("photos") as File[]).filter((f) => f.size > 0);
    if (files.length > MAX_PHOTOS) return setError(`Please attach up to ${MAX_PHOTOS} photos.`);
    if (files.some((f) => f.size > 8 * 1024 * 1024)) return setError("Each photo must be under 8 MB.");

    setError(null);
    setStatus("sending");
    try {
      const photos = await Promise.all(files.map(uploadSubmissionPhoto));
      const details = {
        purpose: form.get("purpose"),
        city: form.get("city"),
        area: form.get("area"),
        address: form.get("address"),
        category: form.get("category"),
        size: form.get("size"),
        size_unit: form.get("unit"),
        expected_price: String(form.get("price") ?? "").replace(/\D/g, ""),
        contact_time: form.get("time"),
        photos,
      };
      const ref = await submitInquiry({
        name: String(form.get("name")),
        mobile: String(form.get("mobile")),
        email: String(form.get("email") ?? ""),
        message: String(form.get("description") ?? ""),
        inquiryType: "sell",
        details,
      });
      setLeadRef(ref);
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please call us instead.");
      setStatus("idle");
    }
  }

  return (
    <div className="container-page py-12">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h1 className="font-display text-4xl font-semibold text-stone-900">Sell or rent out your property</h1>
          <p className="mt-4 text-lg text-stone-600">
            Tell us about your property. An agent will call you, visit, and agree a price with you before anything is listed.
          </p>
          <ol className="mt-10 space-y-6">
            {[
              [Home, "Send your details", "Location, size and your expected price. Photos help but are optional."],
              [ClipboardCheck, "We review and visit", "We check the documents and visit the property. Nothing is published until you approve it."],
              [Users, "We find the buyer or tenant", "We handle viewings, negotiation, the agreement and payment tracking."],
            ].map(([Icon, title, text], i) => {
              const I = Icon as typeof Home;
              return (
                <li key={i} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><I size={20} /></span>
                  <div>
                    <p className="font-semibold text-stone-900">{title as string}</p>
                    <p className="text-sm text-stone-600">{text as string}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          {status === "sent" ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto text-brand-600" size={48} />
              <p className="mt-4 text-xl font-semibold text-stone-900">Thank you. We have your property details.</p>
              <p className="mt-2 text-stone-600">An agent will contact you to arrange a visit. Your reference is <strong>{leadRef}</strong>.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label className="label">I want to</label>
                <div className="flex gap-3">
                  {[["sale", "Sell"], ["rent", "Rent out"]].map(([v, l]) => (
                    <label key={v} className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-stone-300 px-4 py-2.5 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                      <input type="radio" name="purpose" value={v} defaultChecked={v === "sale"} className="accent-brand-700" /> {l}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="s-name">Owner name</label><input id="s-name" name="name" required minLength={2} className="input" autoComplete="name" /></div>
                <div><label className="label" htmlFor="s-mobile">Contact number</label><input id="s-mobile" name="mobile" type="tel" required placeholder="03XX XXXXXXX" pattern="[+0-9 \-]{10,16}" className="input" autoComplete="tel" /></div>
                <div><label className="label" htmlFor="s-email">Email <span className="font-normal text-stone-400">(optional)</span></label><input id="s-email" name="email" type="email" className="input" autoComplete="email" /></div>
                <div>
                  <label className="label" htmlFor="s-time">Best time to call</label>
                  <select id="s-time" name="time" className="input">
                    <option>Any time</option><option>Morning</option><option>Afternoon</option><option>Evening</option>
                  </select>
                </div>
                <div><label className="label" htmlFor="s-city">City</label><input id="s-city" name="city" required className="input" /></div>
                <div><label className="label" htmlFor="s-area">Area / society</label><input id="s-area" name="area" required className="input" /></div>
              </div>
              <div><label className="label" htmlFor="s-address">Address <span className="font-normal text-stone-400">(kept private)</span></label><input id="s-address" name="address" className="input" /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="s-cat">Category</label>
                  <select id="s-cat" name="category" className="input">
                    {ref?.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className="label" htmlFor="s-size">Size</label><input id="s-size" name="size" type="number" min={0} step="any" required className="input" /></div>
                <div>
                  <label className="label" htmlFor="s-unit">Unit</label>
                  <select id="s-unit" name="unit" className="input" defaultValue="marla">
                    {ref?.units.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label" htmlFor="s-price">Expected price (PKR)</label><input id="s-price" name="price" inputMode="numeric" placeholder="e.g. 25000000" className="input" /></div>
              <div><label className="label" htmlFor="s-desc">Description</label><textarea id="s-desc" name="description" rows={4} maxLength={4000} className="input" placeholder="Bedrooms, condition, documents, anything we should know" /></div>
              <div>
                <label className="label" htmlFor="s-photos">Photos <span className="font-normal text-stone-400">(up to {MAX_PHOTOS}, JPEG/PNG/WebP, 8 MB each)</span></label>
                <input id="s-photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-semibold file:text-brand-800" />
              </div>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button className="btn-primary w-full" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Submit property"}</button>
              <p className="text-xs text-stone-500">Submitting does not publish your property. Our team reviews every submission first.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
