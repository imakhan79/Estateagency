import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitInquiry, type InquiryInput } from "../lib/api";

interface Props {
  propertyRef?: string;
  defaultType?: InquiryInput["inquiryType"];
  types?: InquiryInput["inquiryType"][];
  compact?: boolean;
}

const typeLabels: Record<InquiryInput["inquiryType"], string> = {
  buy: "I want to buy",
  rent: "I want to rent",
  sell: "I want to sell",
  general: "General enquiry",
  viewing: "Request a viewing",
};

export default function InquiryForm({ propertyRef, defaultType = "general", types, compact }: Props) {
  const options = types ?? (["buy", "rent", "sell", "general", "viewing"] as const);
  const [inquiryType, setInquiryType] = useState<InquiryInput["inquiryType"]>(defaultType);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [leadRef, setLeadRef] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    setStatus("sending");
    try {
      const ref = await submitInquiry({
        name: String(form.get("name")),
        mobile: String(form.get("mobile")),
        email: String(form.get("email") ?? ""),
        message: String(form.get("message") ?? ""),
        inquiryType,
        propertyRef,
        preferredContact: (form.get("contact") as InquiryInput["preferredContact"]) || undefined,
        preferredViewingDate: inquiryType === "viewing" ? String(form.get("date") ?? "") : undefined,
      });
      setLeadRef(ref);
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please call us instead.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl bg-brand-50 p-6 text-center">
        <CheckCircle2 className="mx-auto text-brand-600" size={40} />
        <p className="mt-3 font-semibold text-stone-900">Thank you, we have your message.</p>
        <p className="mt-1 text-sm text-stone-600">
          One of our agents will contact you shortly. Your reference is <strong>{leadRef}</strong>.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {options.length > 1 && (
        <div>
          <label className="label" htmlFor="inq-type">What can we help with?</label>
          <select id="inq-type" className="input" value={inquiryType} onChange={(e) => setInquiryType(e.target.value as InquiryInput["inquiryType"])}>
            {options.map((t) => (
              <option key={t} value={t}>{typeLabels[t]}</option>
            ))}
          </select>
        </div>
      )}
      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <label className="label" htmlFor="inq-name">Full name</label>
          <input id="inq-name" name="name" required minLength={2} maxLength={120} className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="inq-mobile">Mobile number</label>
          <input id="inq-mobile" name="mobile" required type="tel" inputMode="tel" placeholder="03XX XXXXXXX" pattern="[+0-9 \-]{10,16}" className="input" autoComplete="tel" />
        </div>
      </div>
      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <label className="label" htmlFor="inq-email">Email <span className="font-normal text-stone-400">(optional)</span></label>
          <input id="inq-email" name="email" type="email" className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="inq-contact">Preferred contact</label>
          <select id="inq-contact" name="contact" className="input" defaultValue="phone">
            <option value="phone">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </div>
      </div>
      {inquiryType === "viewing" && (
        <div>
          <label className="label" htmlFor="inq-date">Preferred viewing date</label>
          <input id="inq-date" name="date" type="date" min={today} required className="input" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="inq-message">Message or requirements</label>
        <textarea id="inq-message" name="message" rows={compact ? 3 : 4} maxLength={4000} className="input" />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : inquiryType === "viewing" ? "Request viewing" : "Send enquiry"}
      </button>
      <p className="text-xs text-stone-500">
        We use your details only to respond to this enquiry. See our <a href="/privacy" className="underline">privacy policy</a>.
      </p>
    </form>
  );
}
