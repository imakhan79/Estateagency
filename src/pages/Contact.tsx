import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useReference } from "../lib/api";
import { useDocumentTitle, waLink } from "../lib/format";
import InquiryForm from "../components/InquiryForm";

export default function Contact() {
  const ref = useReference();
  const b = ref?.business;
  useDocumentTitle(`Contact us${b ? ` | ${b.name}` : ""}`);

  return (
    <div className="container-page py-12">
      <h1 className="font-display text-4xl text-stone-900">Contact us</h1>
      <p className="mt-3 max-w-xl text-lg text-stone-600">Call, message us on WhatsApp, or send the form and an agent will get back to you.</p>
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        {b && (
          <ul className="space-y-6">
            {[
              [Phone, "Phone", <a href={`tel:${b.phone}`} className="hover:underline">{b.phone}</a>],
              [MessageCircle, "WhatsApp", <a href={waLink(b.whatsapp)} target="_blank" rel="noreferrer" className="hover:underline">{b.whatsapp}</a>],
              [Mail, "Email", <a href={`mailto:${b.email}`} className="break-all hover:underline">{b.email}</a>],
              [MapPin, "Office", b.address],
              [Clock, "Hours", b.hours],
            ].map(([Icon, label, value]) => {
              const I = Icon as typeof Phone;
              return (
                <li key={label as string} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><I size={20} /></span>
                  <div>
                    <p className="text-sm text-stone-500">{label as string}</p>
                    <p className="font-medium text-stone-900">{value as React.ReactNode}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <InquiryForm />
        </div>
      </div>
    </div>
  );
}
