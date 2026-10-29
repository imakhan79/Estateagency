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

export function waLink(number: string, text?: string) {
  const digits = number.replace(/\D/g, "");
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
