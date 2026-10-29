import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { date, dateTime, label, money, q, supabase, useLoad, type Row } from "../lib";
import { ErrorBox, Spinner } from "../ui";

// Printable receipt generated from a recorded payment (BRD §10.8).
export default function Receipt() {
  const { id } = useParams();
  const { data: r, error } = useLoad(() => q<Row>(supabase.from("payment_receipts").select("*").eq("id", id!).single()), [id]);

  useEffect(() => {
    if (r) document.title = `Receipt ${r.receipt_no}`;
  }, [r]);

  if (!r) return <div className="p-8">{error ? <ErrorBox error={error} /> : <Spinner />}</div>;
  const b = r.business ?? {};
  const allocations: Row[] = r.allocations ?? [];
  const first = allocations[0];
  const outgoing = r.direction === "outgoing";

  return (
    <div className="min-h-screen bg-stone-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl justify-end px-4 print:hidden">
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white"><Printer size={16} /> Print / save as PDF</button>
      </div>
      <article className="relative mx-auto max-w-2xl bg-white p-10 shadow-sm print:shadow-none">
        {r.voided_at && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-12 rounded border-4 border-red-600 px-6 py-2 text-5xl font-bold text-red-600 opacity-70">REVERSED</span>
          </div>
        )}
        <header className="flex items-start justify-between border-b border-stone-200 pb-6">
          <div>
            <p className="text-xl font-semibold text-stone-900">{b.name}</p>
            <p className="mt-1 text-sm text-stone-600">{b.address}</p>
            <p className="text-sm text-stone-600">{b.phone} · {b.email}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold uppercase tracking-wide text-brand-800">{outgoing ? "Payment voucher" : "Receipt"}</p>
            <p className="mt-1 font-mono text-sm">{r.receipt_no}</p>
          </div>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div><dt className="text-stone-500">{outgoing ? "Paid to" : "Received from"}</dt><dd className="font-medium">{r.customer_name}</dd><dd className="text-stone-600">{r.customer_ref} · {r.customer_mobile}</dd></div>
          <div><dt className="text-stone-500">Payment date</dt><dd className="font-medium">{date(r.paid_on)}</dd></div>
          {first && <>
            <div><dt className="text-stone-500">Property</dt><dd className="font-medium">{r.property_refs}</dd><dd className="text-stone-600">{first.property_title}</dd></div>
            <div><dt className="text-stone-500">{first.contract_ref ? "Contract" : "Transaction"}</dt><dd className="font-medium">{first.contract_ref ?? first.transaction_ref ?? "—"}</dd><dd className="text-stone-600">Schedule {r.schedule_refs}</dd></div>
          </>}
          <div><dt className="text-stone-500">Method</dt><dd className="font-medium">{label(r.method)}</dd>{r.reference_no && <dd className="text-stone-600">Ref: {r.reference_no}</dd>}</div>
        </dl>

        <table className="mt-8 w-full text-sm">
          <thead><tr className="border-b border-stone-300 text-left text-stone-500"><th className="py-2">Applied to</th><th className="py-2">Due</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">Remaining</th></tr></thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.installment_id} className="border-b border-stone-100">
                <td className="py-2.5">{a.installment}<span className="block text-xs text-stone-500">{a.schedule_title}</span></td>
                <td className="py-2.5">{date(a.due_date)}</td>
                <td className="py-2.5 text-right">{money(a.amount, r.currency)}</td>
                <td className="py-2.5 text-right text-stone-600">{money(a.installment_outstanding, r.currency)}</td>
              </tr>
            ))}
            {Number(r.unallocated) > 0 && (
              <tr className="border-b border-stone-100"><td className="py-2.5" colSpan={2}>Unallocated credit</td><td className="py-2.5 text-right">{money(r.unallocated, r.currency)}</td><td /></tr>
            )}
          </tbody>
          <tfoot>
            <tr><td className="pt-4 font-medium" colSpan={2}>Total {outgoing ? "paid" : "received"}</td><td className="pt-4 text-right text-lg font-semibold">{money(r.amount, r.currency)}</td><td /></tr>
          </tfoot>
        </table>

        {first && <p className="mt-4 text-right text-sm"><span className="text-stone-500">Balance remaining on {allocations.length > 1 || (r.schedule_ids?.length ?? 0) > 1 ? "these schedules" : "this schedule"}: </span><span className="font-medium">{money(r.schedule_outstanding, r.currency)}</span></p>}
        {r.voided_at && <p className="mt-6 rounded bg-red-50 p-3 text-sm text-red-700">Reversed ({label(r.void_type)}): {r.void_reason}</p>}
        {r.notes && <p className="mt-6 text-sm text-stone-600">Notes: {r.notes}</p>}

        <footer className="mt-16 flex items-end justify-between gap-6 text-sm">
          <p className="text-xs text-stone-500">Recorded by {r.recorded_by_name} on {dateTime(r.recorded_at)}.<br />This receipt confirms only the payment shown above.</p>
          <div className="w-48 shrink-0 border-t border-stone-400 pt-1 text-center text-stone-600">Authorized signature</div>
        </footer>
      </article>
    </div>
  );
}
