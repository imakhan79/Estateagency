import type { Property, Reference } from "./api";

// Pakistani convention: 1 lakh = 100,000; 1 crore = 10,000,000.
export function formatPrice(amount: number, currency = "PKR", rent = false) {
  let text: string;
  if (currency === "PKR") {
    if (amount >= 10_000_000) text = `${trim(amount / 10_000_000)} Crore`;
    else if (amount >= 100_000) text = `${trim(amount / 100_000)} Lakh`;
    else text = amount.toLocaleString("en-PK");
    text = `PKR ${text}`;
  } else {
    text = `${currency} ${amount.toLocaleString("en-US")}`;
  }
  return rent ? `${text} / month` : text;
}

function trim(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatSize(p: Pick<Property, "size" | "size_unit">, ref?: Reference | null) {
  const unit = ref?.units.find((u) => u.code === p.size_unit);
  const name = p.size_unit === "sqft" ? "sq ft" : p.size_unit === "sqyd" ? "sq yd" : (unit?.name ?? p.size_unit);
  return `${Number(p.size).toLocaleString("en-PK")} ${name}`;
}

export const furnishingLabel: Record<string, string> = {
  furnished: "Furnished",
  semi_furnished: "Semi-furnished",
  unfurnished: "Unfurnished",
};

export function typeName(p: Property, ref?: Reference | null) {
  return ref?.types.find((t) => t.id === p.type_id)?.name ?? "";
}

export function availabilityName(slug: string, ref?: Reference | null) {
  return ref?.availability.find((a) => a.slug === slug)?.name ?? slug;
}

// Settings may hold several numbers in one field, e.g. "+92 302 8600631 / +92 315 2069499".
export function splitNumbers(value: string) {
  return value.split(/[\/,;|]|\bor\b/i).map((n) => n.trim()).filter((n) => /\d{6,}/.test(n.replace(/\D/g, "")));
}

export function telLink(number: string) {
  return `tel:${(splitNumbers(number)[0] ?? number).replace(/[^\d+]/g, "")}`;
}

export function waLink(number: string, text?: string) {
  let digits = (splitNumbers(number)[0] ?? number).replace(/\D/g, "");
  // Local Pakistani format (0302...) needs the country code for wa.me.
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function useDocumentTitle(title: string, description?: string) {
  if (typeof document !== "undefined") {
    document.title = title;
    if (description) {
      let tag = document.querySelector('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", description);
    }
  }
}
