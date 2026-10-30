import { useReference } from "../lib/api";
import { useDocumentTitle } from "../lib/format";

// Template wording. The client should have these reviewed by their legal adviser before launch.

export function Privacy() {
  const b = useReference()?.business;
  useDocumentTitle(`Privacy policy${b ? ` | ${b.name}` : ""}`);
  return (
    <article className="container-page prose-page max-w-3xl py-12">
      <h1 className="font-display text-4xl font-semibold text-stone-900">Privacy policy</h1>
      <p>This policy explains how {b?.name ?? "we"} collect and use personal information through this website.</p>
      <h2>What we collect</h2>
      <p>When you send an enquiry, request a viewing or submit a property, we collect the details you enter: your name, mobile number, email address, message, and any property details or photos you provide.</p>
      <h2>How we use it</h2>
      <ul>
        <li>To respond to your enquiry and arrange viewings.</li>
        <li>To assess and market a property you ask us to sell or rent out.</li>
        <li>To prepare agreements and keep records of payments where you become our client.</li>
      </ul>
      <p>We do not sell your information. We share it only with the property owner, buyer or tenant involved in your transaction, or where the law requires it.</p>
      <h2>How long we keep it</h2>
      <p>Enquiry records are kept for as long as needed to follow up and for our business records. Contract and payment records are kept for the period required by law.</p>
      <h2>Your choices</h2>
      <p>You can ask us to update or delete your details, or to stop contacting you, at any time. Contact us at {b?.email} or {b?.phone}.</p>
    </article>
  );
}

export function Terms() {
  const b = useReference()?.business;
  useDocumentTitle(`Terms and conditions${b ? ` | ${b.name}` : ""}`);
  return (
    <article className="container-page prose-page max-w-3xl py-12">
      <h1 className="font-display text-4xl font-semibold text-stone-900">Terms and conditions</h1>
      <p>By using this website you agree to these terms.</p>
      <h2>Listings</h2>
      <p>Property details, prices and availability are provided in good faith but may change without notice. Photos and descriptions are for guidance only and do not form part of any contract. Please verify all details, documents and measurements before committing to a transaction.</p>
      <h2>Enquiries</h2>
      <p>Submitting an enquiry or a property does not create an agreement. A property you submit is published only after our review and your approval.</p>
      <h2>Payments</h2>
      <p>We do not take payments through this website. Payments are made only against a written agreement, and we issue a numbered receipt for every payment received.</p>
      <h2>Liability</h2>
      <p>{b?.name ?? "We"} are not responsible for losses arising from reliance on website content without independent verification.</p>
      <h2>Contact</h2>
      <p>{b?.address} · {b?.phone} · {b?.email}</p>
    </article>
  );
}
