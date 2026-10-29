import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { useAuth } from "../auth";
import { date, label, money, nameOf, q, supabase, today, useLoad, useLookups, type Row } from "../lib";
import { Badge, Button, Card, DL, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Textarea, formValues, useAction } from "../ui";

export default function ScheduleDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const l = useLookups();
  const act = useAction();
  const [paying, setPaying] = useState<Row | null>(null);
  const [reversing, setReversing] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: s, error, reload: reloadSchedule } = useLoad(() =>
    q<Row>(supabase.from("schedule_balances").select("*").eq("id", id!).single()), [id]);
  const extra = useLoad(() =>
    q<Row>(supabase.from("payment_schedules").select("notes, created_at, created_by, customers(id, ref, full_name, mobile), properties(id, ref, title), contracts(id, ref), transactions(id, ref)").eq("id", id!).single()), [id]);
  const installments = useLoad(() => q<Row[]>(supabase.from("installment_balances").select("*").eq("schedule_id", id!).order("seq")), [id]);
  const payments = useLoad(async () => {
    if (!installments.data) return null;
    const ids = installments.data.map((i) => i.id);
    if (!ids.length) return [];
    const rows = await q<Row[]>(supabase.from("payment_allocations").select("amount, installment_id, payments(*)").in("installment_id", ids));
    return rows.map((a) => ({ ...a.payments, allocation_id: `${a.payments.id}-${a.installment_id}`, allocated: a.amount, installment_id: a.installment_id }))
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  }, [installments.data]);

  const reload = () => { reloadSchedule(); installments.reload(); };
  if (!s || !extra.data) return error ? <ErrorBox error={error} /> : <Spinner />;

  const x = extra.data;
  const live = !s.cancelled_at;

  return (
    <>
      <PageHeader
        back={{ to: "/admin/payments", label: "Payments" }}
        title={s.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">{s.ref} · {label(s.payment_type)} <Badge status={s.status} />{s.direction === "outgoing" && <Badge tone="amber">We pay</Badge>}</span>}
        actions={<>
          {can("payments.record") && live && s.outstanding > 0 && <Button onClick={() => setPaying({ schedule: true, outstanding: s.outstanding })}>Record payment</Button>}
          {can("payments.record") && live && <Button variant="secondary" onClick={() => setAdding(true)}>Add installments</Button>}
          {can("payments.adjust") && live && (
            <Button variant="ghost" className="text-red-600" busy={act.busy} onClick={() => {
              if (window.confirm("Cancel this whole schedule? Outstanding amounts drop to zero and reminders stop. Recorded payments stay on file."))
                act.run(() => q(supabase.from("payment_schedules").update({ cancelled_at: new Date().toISOString() }).eq("id", s.id)), reload);
            }}>Cancel schedule</Button>
          )}
        </>}
      />
      <ErrorBox error={act.error} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total payable" value={money(s.total, s.currency)} />
        <Stat label={s.direction === "outgoing" ? "Paid out" : "Received"} value={money(s.paid, s.currency)} tone="green" />
        <Stat label="Outstanding" value={money(s.outstanding, s.currency)} tone={s.outstanding > 0 ? "amber" : undefined} />
        <Stat label="Overdue" value={money(s.overdue, s.currency)} tone={s.overdue > 0 ? "red" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="Installments">
            <Table rows={installments.data} columns={[
              { key: "seq", header: "#", className: "text-stone-500" },
              { key: "description", header: "Description", render: (r) => <>{r.description}{r.status_note && <span className="block text-xs text-stone-500">{r.status_note}</span>}</> },
              { key: "due_date", header: "Due", className: "whitespace-nowrap", render: (r) => <>{date(r.due_date)}{r.days_overdue > 0 && <span className="block text-xs text-red-600">{r.days_overdue} days late</span>}</> },
              { key: "amount", header: "Amount", className: "whitespace-nowrap text-right", render: (r) => money(r.amount) },
              { key: "paid", header: "Paid", className: "whitespace-nowrap text-right", render: (r) => money(r.paid) },
              { key: "outstanding", header: "Outstanding", className: "whitespace-nowrap text-right", render: (r) => money(r.outstanding) },
              { key: "status", header: "Status", render: (r) => <Badge status={r.status} /> },
              { key: "actions", header: "", className: "whitespace-nowrap text-right", render: (r) => (
                <span className="flex justify-end gap-1">
                  {can("payments.record") && r.outstanding > 0 && r.status !== "disputed" && <Button className="px-2.5 py-1" onClick={() => setPaying(r)}>Record payment</Button>}
                  {can("payments.record") && live && r.status !== "cancelled" && <Button variant="ghost" className="px-2 py-1" onClick={() => setEditing(r)}>⋯</Button>}
                </span>) },
            ]} />
          </Card>

          <Card title="Payment history">
            <Table rows={payments.data} rowKey="allocation_id" empty="No payments recorded yet." columns={[
              { key: "receipt_no", header: "Receipt", className: "whitespace-nowrap", render: (r) => <a className="text-brand-700 hover:underline" href={`/admin/receipt/${r.id}`} target="_blank" rel="noreferrer">{r.receipt_no}</a> },
              { key: "paid_on", header: "Date", className: "whitespace-nowrap", render: (r) => date(r.paid_on) },
              { key: "installment", header: "Installment", render: (r) => `#${installments.data?.find((i) => i.id === r.installment_id)?.seq ?? "?"}` },
              { key: "method", header: "Method", render: (r) => <>{label(r.method)}{r.reference_no && <span className="block text-xs text-stone-500">{r.reference_no}</span>}</> },
              { key: "amount", header: "Applied here", className: "whitespace-nowrap text-right", render: (r) => <span className={r.voided_at ? "text-stone-400 line-through" : ""}>{money(r.allocated, r.currency)}{Number(r.allocated) !== Number(r.amount) && <span className="block text-xs text-stone-500">of {money(r.amount, r.currency)} payment</span>}</span> },
              { key: "recorded_by", header: "Recorded by", render: (r) => <span className="text-xs">{nameOf(l?.staff, r.recorded_by, "id", "full_name")}</span> },
              { key: "status", header: "", render: (r) => r.voided_at
                ? <span className="text-xs"><Badge tone="red">{label(r.void_type)}</Badge><span className="block text-stone-500">{r.void_reason}</span></span>
                : can("payments.adjust") && <Button variant="ghost" className="px-2 py-1 text-red-600" onClick={() => setReversing(r)}>Reverse</Button> },
            ]} />
          </Card>
        </div>

        <Card title="Details">
          <DL items={[
            ["Customer", <Link className="text-brand-700" to={`/admin/customers/${x.customers.id}`}>{x.customers.ref} {x.customers.full_name}</Link>],
            ["Mobile", x.customers.mobile],
            ["Property", <Link className="text-brand-700" to={`/admin/properties/${x.properties.id}`}>{x.properties.ref} {x.properties.title}</Link>],
            ["For", x.contracts ? <Link className="text-brand-700" to={`/admin/contracts/${x.contracts.id}`}>Contract {x.contracts.ref}</Link>
              : x.transactions ? <Link className="text-brand-700" to={`/admin/transactions/${x.transactions.id}`}>Transaction {x.transactions.ref}</Link> : null],
            ["Next due", date(s.next_due_date)], ["Created", date(x.created_at)],
          ]} />
          {x.notes && <p className="mt-4 whitespace-pre-line text-sm text-stone-600">{x.notes}</p>}
        </Card>
      </div>

      {paying && <RecordPayment inst={paying} schedule={s} canOverpay={can("payments.adjust")} onClose={() => setPaying(null)} onDone={reload} />}

      <Modal title={`Reverse payment ${reversing?.receipt_no ?? ""}`} open={!!reversing} onClose={() => setReversing(null)}>
        <p className="mb-4 text-sm text-stone-600">The payment stays on file marked as reversed, and the installment balance goes back up. This can't be undone; record the payment again if needed.</p>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          if (await act.run(() => q(supabase.from("payments").update({ voided_at: new Date().toISOString(), void_type: v.type, void_reason: v.reason }).eq("id", reversing!.id)), reload)) setReversing(null);
        }}>
          <Field label="Reason type"><Select name="type" required>
            <option value="entry_error">Entry error</option><option value="duplicate">Duplicate entry</option>
            <option value="dishonoured_cheque">Dishonoured cheque</option><option value="cancelled">Cancelled payment</option><option value="other">Other</option>
          </Select></Field>
          <Field label="Details"><Textarea name="reason" required /></Field>
          <ErrorBox error={act.error} />
          <Button type="submit" variant="danger" busy={act.busy}>Reverse payment</Button>
        </form>
      </Modal>

      <Modal title={`Installment #${editing?.seq ?? ""}`} open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <div className="space-y-5">
            {editing.paid === 0 || Number(editing.paid) === 0 ? (
              <form className="grid gap-3" onSubmit={async (e) => {
                e.preventDefault();
                const v = formValues(e.currentTarget);
                if (await act.run(() => q(supabase.from("installments").update({ description: v.description, due_date: v.due_date, amount: Number(v.amount) }).eq("id", editing.id)), reload)) setEditing(null);
              }}>
                <Field label="Description"><Input name="description" required defaultValue={editing.description} /></Field>
                <Field label="Due date"><Input name="due_date" type="date" required defaultValue={editing.due_date} /></Field>
                <Field label="Amount"><Input name="amount" type="number" min={1} step="any" required defaultValue={editing.amount} /></Field>
                <Button type="submit" busy={act.busy}>Save changes</Button>
              </form>
            ) : <p className="text-sm text-stone-600">Payments have been recorded against this installment, so its amount and due date are locked.</p>}
            <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
              {editing.status === "disputed"
                ? <Button variant="secondary" busy={act.busy} onClick={() => act.run(() => q(supabase.from("installments").update({ disputed_at: null, status_note: null }).eq("id", editing.id)), () => { setEditing(null); reload(); })}>Resolve dispute</Button>
                : <Button variant="secondary" busy={act.busy} onClick={() => {
                    const note = window.prompt("What is disputed?");
                    if (note) act.run(() => q(supabase.from("installments").update({ disputed_at: new Date().toISOString(), status_note: note }).eq("id", editing.id)), () => { setEditing(null); reload(); });
                  }}>Mark disputed</Button>}
              {can("payments.adjust") && (
                <Button variant="ghost" className="text-red-600" busy={act.busy} onClick={() => {
                  const note = window.prompt("Reason for cancelling this installment (authorized adjustment)");
                  if (note) act.run(() => q(supabase.from("installments").update({ cancelled_at: new Date().toISOString(), status_note: note }).eq("id", editing.id)), () => { setEditing(null); reload(); });
                }}>Cancel installment</Button>
              )}
            </div>
            <ErrorBox error={act.error} />
          </div>
        )}
      </Modal>

      <Modal title="Add installments" open={adding} onClose={() => setAdding(false)}>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          if (await act.run(() => q(supabase.rpc("add_installments", {
            p_schedule: s.id, p_total: Number(v.total), p_count: Number(v.count), p_first_due: v.first_due,
            p_every: v.every, p_label: v.label ?? "Installment",
          })), reload)) setAdding(false);
        }}>
          <Field label="Label"><Input name="label" defaultValue="Installment" /></Field>
          <Field label="Total to add"><Input name="total" type="number" min={1} required /></Field>
          <Field label="Number of installments"><Input name="count" type="number" min={1} max={600} required defaultValue={1} /></Field>
          <Field label="First due date"><Input name="first_due" type="date" required defaultValue={today()} /></Field>
          <Field label="Every"><Select name="every" defaultValue="1 month"><option value="1 month">Month</option><option value="3 months">Quarter</option><option value="6 months">6 months</option><option value="1 year">Year</option></Select></Field>
          <ErrorBox error={act.error} />
          <Button type="submit" busy={act.busy}>Add</Button>
        </form>
      </Modal>
    </>
  );
}

function RecordPayment({ inst, schedule, canOverpay, onClose, onDone }: { inst: Row; schedule: Row; canOverpay: boolean; onClose: () => void; onDone: () => void }) {
  const act = useAction();
  const [method, setMethod] = useState("bank_transfer");
  const [saved, setSaved] = useState<Row | null>(null);
  const currency = schedule.currency;
  const wholeSchedule = !!inst.schedule;

  if (saved) {
    return (
      <Modal title="Payment recorded" open onClose={onClose}>
        <p className="text-sm text-stone-700">Receipt <strong>{saved.receipt_no}</strong> for {money(saved.amount, currency)} has been recorded{saved.installments ? ` against: ${saved.installments}` : ""}.</p>
        {Number(saved.unallocated) > 0 && <p className="mt-2 text-sm text-amber-700">{money(saved.unallocated, currency)} was more than the outstanding balance and is held as unallocated credit.</p>}
        <div className="mt-5 flex gap-2">
          <a href={`/admin/receipt/${saved.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800"><Printer size={16} /> Print receipt</a>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={wholeSchedule ? "Record payment" : `Record payment — ${inst.description}`} open onClose={onClose}>
      <p className="mb-4 text-sm text-stone-600">
        {wholeSchedule
          ? <>Outstanding on this schedule: <strong>{money(inst.outstanding, currency)}</strong>. The payment is applied to the oldest unpaid installments first, so one payment can cover several installments.</>
          : <>Outstanding on this installment: <strong>{money(inst.outstanding, currency)}</strong>. Enter less to record a partial payment.</>}
      </p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        await act.run(async () => {
          const amount = Number(v.amount);
          const paymentId = await q<string>(supabase.rpc("record_payment", {
            p_customer: schedule.customer_id, p_amount: amount, p_paid_on: v.paid_on, p_method: method,
            p_reference: v.reference_no, p_notes: v.notes, p_currency: currency,
            p_allocations: wholeSchedule ? null : [{ installment_id: inst.id, amount }],
            p_schedule: wholeSchedule ? schedule.id : null,
          }));
          setSaved(await q<Row>(supabase.from("payment_receipts").select("id, receipt_no, amount, unallocated, installments").eq("id", paymentId).single()));
          onDone();
        });
      }}>
        <Field label={`Amount (${currency})`}><Input name="amount" type="number" min={1} step="any" max={canOverpay ? undefined : inst.outstanding} required defaultValue={inst.outstanding} /></Field>
        <Field label="Date received"><Input name="paid_on" type="date" required max={today()} defaultValue={today()} /></Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {["cash", "bank_transfer", "cheque", "pay_order", "online", "other"].map((m) => <option key={m} value={m}>{label(m)}</option>)}
          </Select>
        </Field>
        <Field label={method === "cheque" ? "Cheque number and bank" : "Bank / transaction reference"}>
          <Input name="reference_no" required={["cheque", "pay_order", "bank_transfer", "online"].includes(method)} />
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} /></Field>
        <div className="sm:col-span-2"><ErrorBox error={act.error} /><Button type="submit" busy={act.busy}>Record payment</Button></div>
      </form>
    </Modal>
  );
}
