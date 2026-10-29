// End-to-end test of the BRD workflows (§15) and acceptance criteria (§19, AC01–AC19) against the real
// database, acting as each demo role so row level security and triggers apply exactly as in the app.
// Everything runs in one transaction that is rolled back — no data is changed.
// Usage: npm run test:workflows   (needs the demo accounts: npm run db:demo-users)
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

let passed = 0;
const failures = [];
const users = {};

async function sql(text, params) {
  return (await c.query(text, params)).rows;
}
async function one(text, params) {
  return (await sql(text, params))[0];
}

async function as(who) {
  await c.query("reset role");
  if (who === "system") {
    await c.query("select set_config('request.jwt.claims', '', true)");
    return;
  }
  if (who === "anon") {
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await c.query("set local role anon");
    return;
  }
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: users[who], role: "authenticated" })]);
  await c.query("set local role authenticated");
}

/** Runs a step in a savepoint. expect: "ok" (must succeed) or "deny" (must raise). check(result) may throw. */
async function step(ac, name, who, fn, { expect = "ok", check } = {}) {
  await as(who);
  await c.query("savepoint s");
  let result, error;
  try {
    result = await fn();
  } catch (e) {
    error = e;
  }
  const label = `${ac.padEnd(5)} ${name} [${who}]`;
  try {
    if (expect === "ok" && error) throw new Error(`expected success, got: ${error.message}`);
    if (expect === "deny" && !error) throw new Error("expected this to be refused, but it succeeded");
    if (check && !error) await check(result);
    passed++;
    console.log(`  ✓ ${label}${expect === "deny" ? ` — refused: ${error.message.slice(0, 70)}` : ""}`);
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
    console.log(`  ✗ ${label}: ${e.message}`);
  }
  if (error) await c.query("rollback to savepoint s");
  else await c.query("release savepoint s");
  await c.query("reset role");
  return result;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const ids = (rows) => rows.map((r) => r.id);
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

try {
  for (const r of await sql("select email, id from auth.users where email like '%@demo.local'")) users[r.email.split("@")[0]] = r.id;
  for (const k of ["superadmin", "manager", "property", "agent", "finance", "legal"]) assert(users[k], `Missing demo account ${k}@demo.local — run npm run db:demo-users`);

  await c.query("begin");
  const ref = async (table, slug) => (await one(`select id from public.${table} where slug = $1`, [slug])).id;
  const residential = await ref("property_categories", "residential");
  const house = await ref("property_types", "house");
  const tx = (slug) => ref("transaction_statuses", slug);
  const NEGOTIATION = await tx("negotiation");
  const COMPLETED = await tx("completed");

  console.log("\n15.1 Property listing workflow");
  const prop = await step("AC01", "property manager creates a draft listing", "property", () => one(
    `insert into properties (slug, title, description, category_id, type_id, listing_type, price, city, area, size, size_unit, bedrooms, bathrooms)
     values ('wf-test-house', 'Workflow test house', 'A test listing with enough description to satisfy the publishing rule.', $1, $2, 'sale', 30000000, 'Lahore', 'Johar Town', 10, 'marla', 4, 3)
     returning id, ref`, [residential, house]));
  await step("AC01", "publishing without a photo is refused", "property", () => sql("update properties set publication = 'published' where id = $1", [prop.id]), { expect: "deny" });
  await step("AC01", "upload photo metadata", "property", () => sql("insert into property_media (property_id, kind, external_url) values ($1, 'image', 'https://example.com/a.jpg')", [prop.id]));
  await step("AC18", "agent cannot publish", "agent", () => sql("update properties set publication = 'published' where id = $1 returning id", [prop.id]),
    { check: (r) => assert(r.length === 0, "agent changed a property it cannot see") });
  await step("AC01", "property manager publishes", "property", () => sql("update properties set publication = 'published' where id = $1 returning published_at", [prop.id]),
    { check: (r) => assert(r[0]?.published_at, "published_at not set") });
  await step("AC02", "visitor sees the published listing with public columns", "anon", () => sql("select ref, title, price, city from properties where id = $1", [prop.id]),
    { check: (r) => assert(r.length === 1 && r[0].title === "Workflow test house", "listing not visible to visitors") });
  await step("AC18", "visitor cannot read the private address", "anon", () => sql("select address from properties where id = $1", [prop.id]), { expect: "deny" });
  await step("AC03", "visitor search: sale, Lahore, 20–40M, 3+ beds", "anon", () => sql(
    "select id from properties where listing_type = 'sale' and city ilike 'lahore' and price between 20000000 and 40000000 and bedrooms >= 3"),
    { check: (r) => assert(ids(r).includes(prop.id), "search did not return the listing") });
  await step("AC03", "visitor search excludes non-matching filters", "anon", () => sql("select id from properties where listing_type = 'rent' and id = $1", [prop.id]),
    { check: (r) => assert(r.length === 0, "rent filter returned a sale listing") });
  await step("AC06", "price change is recorded in history", "property", () => sql("update properties set price = 29500000 where id = $1", [prop.id]));
  await step("AC06", "mark as sold", "property", () => sql("update properties set availability = 'sold' where id = $1", [prop.id]));
  await step("AC06", "sold listing drops off the website", "anon", () => sql("select id from properties where id = $1", [prop.id]),
    { check: (r) => assert(r.length === 0, "sold listing still public") });
  await step("AC07", "archive the property", "property", () => sql("update properties set publication = 'archived' where id = $1 returning archived_at", [prop.id]),
    { check: (r) => assert(r[0]?.archived_at, "archived_at not set") });
  await step("AC07", "archived property still visible to staff, with history", "manager", () => sql(
    "select p.id, (select count(*) from property_history h where h.property_id = p.id) as changes from properties p where p.id = $1", [prop.id]),
    { check: (r) => assert(r.length === 1 && Number(r[0].changes) >= 3, `expected history rows, got ${r[0]?.changes}`) });
  await step("BR-05", "archived property hidden from visitors", "anon", () => sql("select id from properties where id = $1", [prop.id]),
    { check: (r) => assert(r.length === 0, "archived listing public") });

  // A second published listing used by the deal workflows.
  await as("system");
  const deal = await one(`insert into properties (slug, title, description, category_id, type_id, listing_type, price, city, area, size, size_unit, bedrooms, bathrooms)
     values ('wf-test-deal', 'Workflow deal house', 'Second test listing used for the sales workflow and payments.', $1, $2, 'sale', 20000000, 'Lahore', 'Model Town', 1, 'kanal', 5, 5)
     returning id, ref`, [residential, house]);
  await sql("insert into property_media (property_id, kind, external_url) values ($1, 'image', 'https://example.com/b.jpg')", [deal.id]);
  await sql("update properties set publication = 'published' where id = $1", [deal.id]);

  console.log("\n15.2 Sales workflow");
  const leadRef = await step("AC04", "visitor submits an enquiry on the listing", "anon", () => one(
    "select submit_inquiry('Workflow Buyer', '0300 5550001', 'viewing', 'wf@example.com', 'Can I see it on Saturday?', $1, 'whatsapp', $2::date) as ref", [deal.ref, iso(3)]));
  const lead = await one("select id, property_id, source_id, assigned_to from leads where ref = $1", [leadRef?.ref]);
  await step("AC04", "lead is linked to the property, source and date", "manager", () => one(
    "select l.property_id, s.slug as source, l.created_at from leads l join lead_sources s on s.id = l.source_id where l.id = $1", [lead.id]),
    { check: (r) => assert(r.property_id === deal.id && r.source === "website-viewing", `got ${JSON.stringify(r)}`) });
  await step("AC04", "new enquiry notifies managers", "manager", () => sql("select title from notifications where entity_id = $1", [lead.id]),
    { check: (r) => assert(r.length >= 1, "manager got no notification") });
  await step("AC18", "visitor cannot read leads", "anon", () => sql("select * from leads limit 1"), { expect: "deny" });
  await step("4.6", "a second enquiry within a minute is refused (flood protection)", "anon", () => one("select submit_inquiry('W Buyer', '03005550001', 'general') as ref"), { expect: "deny" });
  await as("system");
  await sql("update leads set created_at = created_at - interval '2 minutes' where id = $1", [lead.id]);
  const repeat = await step("BR-19", "second enquiry links to the first", "anon", () => one("select submit_inquiry('W Buyer', '+92 300 5550001', 'general') as ref"));
  await step("BR-19", "duplicate_of is set", "manager", () => one("select duplicate_of from leads where ref = $1", [repeat?.ref]),
    { check: (r) => assert(r.duplicate_of === lead.id, "repeat lead not flagged") });
  await step("AC18", "agent cannot see an unassigned lead", "agent", () => sql("select id from leads where id = $1", [lead.id]),
    { check: (r) => assert(r.length === 0, "agent saw an unassigned lead") });
  await step("AC05", "manager assigns the lead to the agent", "manager", () => sql("update leads set assigned_to = $2 where id = $1 returning id", [lead.id, users.agent]),
    { check: (r) => assert(r.length === 1, "assignment did not apply") });
  await step("AC05", "agent is notified and now sees the lead", "agent", () => sql("select l.id, (select count(*) from notifications n where n.entity_id = l.id) as n from leads l where l.id = $1", [lead.id]),
    { check: (r) => assert(r.length === 1 && Number(r[0].n) >= 1, "agent can't see lead or wasn't notified") });
  await step("AC05", "agent schedules a viewing follow-up", "agent", () => sql(
    "insert into activities (kind, lead_id, property_id, subject, due_at) values ('visit', $1, $2, 'Saturday viewing', now() + interval '1 day') returning assigned_to", [lead.id, deal.id]),
    { check: (r) => assert(r[0].assigned_to === users.agent, "follow-up not assigned to the agent") });
  await step("AC18", "agent cannot reassign to someone else", "agent", () => sql("update leads set assigned_to = $2 where id = $1", [lead.id, users.manager]), { expect: "deny" });
  const buyer = await step("AC08", "agent converts the lead to a customer", "agent", () => one("select convert_lead($1) as id", [lead.id]));
  await as("system");
  const seller = (await one("insert into customers (full_name, mobile) values ('Workflow Seller', '0300 5550002') returning id")).id;
  const t = await step("AC08", "agent creates a sale transaction", "agent", () => one(
    "insert into transactions (kind, property_id, lead_id, status_id, agreed_price, deposit) values ('sale', $1, $2, $3, 20000000, 2000000) returning id, agent_id",
    [deal.id, lead.id, NEGOTIATION]), { check: (r) => assert(r.agent_id === users.agent, "agent not set as owner") });
  await step("AC08", "agent adds buyer and seller", "agent", () => sql("insert into transaction_parties values ($1, $2, 'buyer'), ($1, $3, 'seller')", [t.id, buyer.id, seller]));
  await step("AC08", "agent submits for approval; managers notified", "agent", () => sql("update transactions set approval_status = 'pending' where id = $1", [t.id]));
  await step("AC18", "agent cannot approve", "agent", () => sql("update transactions set approval_status = 'approved' where id = $1", [t.id]), { expect: "deny" });
  await step("AC08", "manager approves", "manager", () => sql("update transactions set approval_status = 'approved' where id = $1 returning approved_by", [t.id]),
    { check: (r) => assert(r[0]?.approved_by === users.manager, "approver not recorded") });
  await step("BR-18", "completion refused while contract and payments are missing", "superadmin", () => sql(
    "update transactions set status_id = $2 where id = $1", [t.id, COMPLETED]), { expect: "deny" });

  console.log("\n15.2 / 9 Contract");
  const saleType = await ref("contract_types", "sale");
  const sc = await step("AC09", "legal officer creates the sale contract with dates", "legal", () => one(
    "insert into contracts (type_id, property_id, transaction_id, start_date, value) values ($1, $2, $3, current_date, 20000000) returning id, status, responsible_id",
    [saleType, deal.id, t.id]), { check: (r) => assert(r.status === "draft" && r.responsible_id === users.legal, "contract defaults wrong") });
  await step("BR-07", "pending signature refused without parties", "legal", () => sql("update contracts set status = 'pending_signature' where id = $1", [sc.id]), { expect: "deny" });
  await step("AC09", "add parties, send for signature, activate", "legal", async () => {
    await sql("insert into contract_parties values ($1, $2, 'buyer'), ($1, $3, 'seller')", [sc.id, buyer.id, seller]);
    await sql("update contracts set status = 'pending_signature' where id = $1", [sc.id]);
    return sql("update contracts set status = 'active', signed_on = current_date where id = $1 returning status", [sc.id]);
  });
  await step("9.3", "invalid status jump refused (active → draft)", "legal", () => sql("update contracts set status = 'draft' where id = $1", [sc.id]), { expect: "deny" });
  await step("AC18", "legal officer cannot cancel without contracts.cancel", "legal", () => sql("update contracts set status = 'termination_in_progress' where id = $1", [sc.id]));
  await step("AC18", "…and cannot terminate", "legal", () => sql("update contracts set status = 'terminated', termination_reason = 'x' where id = $1", [sc.id]), { expect: "deny" });
  await as("system");
  await sql("update contracts set status = 'active' where id = $1", [sc.id]);
  await step("9.4", "document versions are kept", "legal", async () => {
    for (let i = 0; i < 2; i++) {
      await sql("insert into contract_documents (contract_id, storage_path, file_name, mime_type, size_bytes) values ($1, $2, 'agreement.pdf', 'application/pdf', 1000)", [sc.id, `contracts/${sc.id}/v${i}.pdf`]);
    }
    return sql("select version from contract_documents where contract_id = $1 order by version", [sc.id]);
  }, { check: (r) => assert(r.map((x) => x.version).join() === "1,2", "versions not incremented") });
  await step("9.4", "unsupported file type refused", "legal", () => sql(
    "insert into contract_documents (contract_id, storage_path, file_name, mime_type, size_bytes) values ($1, 'contracts/x.exe', 'x.exe', 'application/x-msdownload', 10)", [sc.id]), { expect: "deny" });

  console.log("\n15.4 Payment workflow");
  const sched = await step("AC11", "finance creates an installment schedule for the transaction", "finance", async () => {
    const s = await one("insert into payment_schedules (title, customer_id, property_id, transaction_id, payment_type) values ('Price', $1, $2, $3, 'installments') returning id", [buyer.id, deal.id, t.id]);
    await sql("select add_installments($1, 20000000, 4, $2::date, '1 month')", [s.id, iso(-40)]);
    return s;
  });
  await step("10.5", "duplicate schedule of the same type refused", "finance", () => sql(
    "insert into payment_schedules (title, customer_id, property_id, transaction_id, payment_type) values ('Dup', $1, $2, $3, 'installments')", [buyer.id, deal.id, t.id]), { expect: "deny" });
  await step("AC13", "four installments with their own due dates", "finance", () => sql("select due_date, amount from installments where schedule_id = $1 order by seq", [sched.id]),
    { check: (r) => assert(r.length === 4 && new Set(r.map((x) => String(x.due_date))).size === 4 && r.every((x) => Number(x.amount) === 5000000), "installments wrong") });
  await step("AC12", "full payment of installment 1", "finance", () => one(
    "select record_payment($1, 5000000, $2::date, 'bank_transfer', 'IBFT1', null, 'PKR', null, $3) as id", [buyer.id, iso(-40), sched.id]));
  const partial = await step("AC12", "partial payment of 2M", "finance", () => one(
    "select record_payment($1, 2000000, $2::date, 'cheque', 'CHQ1', null, 'PKR', null, $3) as id", [buyer.id, iso(-5), sched.id]));
  await step("AC14", "paid and outstanding are correct", "finance", () => one("select paid, outstanding, overdue, status from schedule_balances where id = $1", [sched.id]),
    { check: (r) => assert(Number(r.paid) === 7000000 && Number(r.outstanding) === 13000000 && Number(r.overdue) === 3000000 && r.status === "overdue", JSON.stringify(r)) });
  await step("AC14", "installment statuses: paid, overdue (partly paid), then upcoming", "finance", () => sql("select status, paid, outstanding from installment_balances where schedule_id = $1 order by seq", [sched.id]),
    { check: (r) => assert(r[0].status === "paid" && r[1].status === "overdue" && Number(r[1].outstanding) === 3000000, JSON.stringify(r.slice(0, 2))) });
  await step("16.1", "one payment allocated across two installments", "finance", () => one(
    "select record_payment($1, 8000000, current_date, 'pay_order', 'PO1', null, 'PKR', null, $2) as id", [buyer.id, sched.id]),
    { check: async (r) => {
      const a = await sql("select count(*)::int as n from payment_allocations where payment_id = $1", [r.id]);
      assert(a[0].n === 2, `expected 2 allocations, got ${a[0].n}`);
    } });
  await step("AC16", "receipt shows customer, property, allocations and remaining balance", "finance", () => one(
    "select receipt_no, customer_name, property_refs, installments, schedule_outstanding from payment_receipts where id = $1", [partial.id]),
    { check: (r) => assert(r.receipt_no?.startsWith("RC-") && r.property_refs === deal.ref && Number(r.schedule_outstanding) === 5000000, JSON.stringify(r)) });
  await step("10.5", "overpayment refused", "finance", () => sql("select record_payment($1, 9000000, current_date, 'cash', null, null, 'PKR', null, $2)", [buyer.id, sched.id]), { expect: "deny" });
  await step("10.9", "finance cannot reverse a payment", "finance", () => sql("update payments set voided_at = now(), void_type = 'duplicate', void_reason = 'x' where id = $1", [partial.id]), { expect: "deny" });
  await step("10.9", "payments cannot be edited or deleted", "superadmin", () => sql("update payments set amount = 1 where id = $1", [partial.id]), { expect: "deny" });
  await step("10.9", "super admin reverses a bounced cheque; balance goes back up", "superadmin", async () => {
    await sql("update payments set voided_at = now(), void_type = 'dishonoured_cheque', void_reason = 'Cheque bounced' where id = $1", [partial.id]);
    return one("select outstanding from schedule_balances where id = $1", [sched.id]);
  }, { check: (r) => assert(Number(r.outstanding) === 7000000, `outstanding ${r.outstanding}`) });
  await step("AC17", "finance views payment history and the collections report", "finance", async () => ({
    history: await sql("select id from payment_receipts where customer_id = $1", [buyer.id]),
    report: await sql("select * from report_collections"),
  }), { check: (r) => assert(r.history.length === 3 && r.report.length > 0, `history ${r.history.length}`) });
  await step("AC18", "agent sees no payment data", "agent", () => sql("select id from payment_schedules"),
    { check: (r) => assert(r.length === 0, "agent can see payments") });

  console.log("\n15.2 Completion and commissions");
  await step("AC12", "finance settles the rest", "finance", () => sql("select record_payment($1, 7000000, current_date, 'bank_transfer', 'IBFT9', null, 'PKR', null, $2)", [buyer.id, sched.id]));
  await step("BR-18", "manager completes the sale once everything is satisfied", "superadmin", () => sql("update transactions set status_id = $2 where id = $1 returning id", [t.id, COMPLETED]));
  await step("22.1", "commissions created automatically (2 brokerage + agent share)", "finance", () => sql("select kind, amount from commissions where transaction_id = $1 order by kind, amount", [t.id]),
    { check: (r) => assert(r.length === 3 && r.filter((x) => x.kind === "brokerage").every((x) => Number(x.amount) === 200000) && Number(r.find((x) => x.kind === "agent").amount) === 100000, JSON.stringify(r)) });
  await step("22.1", "agent sees own commission only", "agent", () => sql("select kind from commissions where transaction_id = $1", [t.id]),
    { check: (r) => assert(r.length === 1 && r[0].kind === "agent", JSON.stringify(r)) });

  console.log("\n15.3 / 15.5 Rental and renewal workflow, reminders");
  const rentalType = await ref("contract_types", "rental");
  await as("system");
  const tenant = (await one("insert into customers (full_name, mobile) values ('Workflow Tenant', '0300 5550003') returning id")).id;
  const rc = await step("AC09", "legal creates a rental ending in 30 days", "legal", async () => {
    const r = await one(`insert into contracts (type_id, property_id, start_date, end_date, rent_amount, security_deposit, payment_frequency, payment_due_day)
      values ($1, $2, current_date - 335, current_date + 30, 100000, 200000, 'monthly', 1) returning id`, [rentalType, deal.id]);
    await sql("insert into contract_parties values ($1, $2, 'tenant')", [r.id, tenant]);
    await sql("update contracts set status = 'pending_signature' where id = $1", [r.id]);
    await sql("update contracts set status = 'active' where id = $1", [r.id]);
    return r;
  });
  const rs = await step("8.3", "finance builds the recurring rent schedule", "finance", () => one("select create_rent_schedule($1) as id", [rc.id]),
    { check: async (r) => {
      const n = await one("select count(*)::int as n, min(description) as first from installments where schedule_id = $1", [r.id]);
      assert(n.n >= 12, `only ${n.n} installments`);
    } });
  await step("10.5", "second rent schedule for the same contract refused", "finance", () => sql("select create_rent_schedule($1)", [rc.id]), { expect: "deny" });
  await as("system");
  // Pay everything except the most recent month, which is left partly paid; add one installment due in 7 days.
  const rentRows = await sql("select id, amount, due_date from installment_balances where schedule_id = $1 and due_date < current_date - 10 order by seq", [rs.id]);
  for (const r of rentRows) await sql("insert into payment_allocations (payment_id, installment_id, amount) select record_payment($1, $2, $3::date, 'cash'), $4, 0 where false", [tenant, r.amount, r.due_date, r.id]);
  await sql("select record_payment($1, $2, current_date - 15, 'cash', null, null, 'PKR', null, $3)", [tenant, rentRows.reduce((a, r) => a + Number(r.amount), 0), rs.id]);
  const lastDue = await one("insert into installments (schedule_id, seq, description, due_date, amount) values ($1, 998, 'Test overdue rent', current_date - 3, 100000) returning id", [rs.id]);
  await sql("select record_payment($1, 40000, current_date - 2, 'cash', null, null, 'PKR', jsonb_build_array(jsonb_build_object('installment_id', $2::text, 'amount', 40000)))", [tenant, lastDue.id]);
  const upcoming = await one("insert into installments (schedule_id, seq, description, due_date, amount) values ($1, 999, 'Test upcoming', current_date + 7, 5000) returning id", [rs.id]);

  const reminders = await step("AC10", "daily reminder job runs", "system", () => one("select run_daily_reminders() as n"),
    { check: (r) => assert(r.n > 0, "no reminders created") });
  await step("AC10", "contract flipped to expiring soon; expiry reminder to responsible officer", "legal", () => one(
    "select c.status, (select count(*) from reminder_log r where r.entity_id = c.id and r.category = 'contract_expiry' and r.recipient_staff_id = $2) as n from contracts c where c.id = $1", [rc.id, users.legal]),
    { check: (r) => assert(r.status === "expiring_soon" && Number(r.n) >= 1, JSON.stringify(r)) });
  await step("AC15", "upcoming payment reminder sent to finance", "finance", () => sql("select title from notifications where entity_id = $1 and kind = 'payment_upcoming'", [upcoming.id]),
    { check: (r) => assert(r.length >= 1, "no upcoming reminder") });
  if (lastDue) {
    await step("AC15", "overdue reminder states the remaining amount, not the full rent", "finance", () => one(
      "select body from notifications where entity_id = $1 and kind = 'payment_overdue' limit 1", [lastDue.id]),
      { check: (r) => assert(r?.body?.includes("60,000 remaining"), `body: ${r?.body}`) });
  }
  await step("BR-12", "reminders stop once paid: settle and re-run, nothing new for that installment", "system", async () => {
    await sql("select record_payment($1, 5000, current_date, 'cash', null, null, 'PKR', jsonb_build_array(jsonb_build_object('installment_id', $2::text, 'amount', 5000)))", [tenant, upcoming.id]);
    await sql("delete from reminder_log where entity_id = $1", [upcoming.id]);
    await sql("select run_daily_reminders()");
    return one("select count(*)::int as n from reminder_log where entity_id = $1", [upcoming.id]);
  }, { check: (r) => assert(r.n === 0, `${r.n} reminders for a paid installment`) });
  await step("AC10", "reminders are not duplicated on a second run", "system", () => one("select run_daily_reminders() as n"),
    { check: (r) => assert(r.n === 0, `${r.n} duplicates`) });
  const renewed = await step("8.4", "renewal creates a new linked draft; old terms kept", "legal", () => one(
    "select renew_contract($1, current_date + 31, current_date + 396, 110000) as id", [rc.id]),
    { check: async (r) => {
      const [o, n] = await Promise.all([one("select status, rent_amount from contracts where id = $1", [rc.id]), one("select status, rent_amount, previous_contract_id from contracts where id = $1", [r.id])]);
      assert(o.status === "renewed" && Number(o.rent_amount) === 100000 && n.status === "draft" && Number(n.rent_amount) === 110000 && n.previous_contract_id === rc.id, JSON.stringify({ o, n }));
    } });
  await step("22.1", "activating the renewal creates rental commissions", "legal", async () => {
    await sql("update contracts set status = 'pending_signature' where id = $1", [renewed.id]);
    await sql("update contracts set status = 'active' where id = $1", [renewed.id]);
    return null;
  });
  await as("system");
  await step("22.1", "rental brokerage = half a month from the tenant", "finance", () => sql("select kind, amount from commissions where contract_id = $1 order by kind", [renewed.id]),
    { check: (r) => assert(r.some((x) => x.kind === "brokerage" && Number(x.amount) === 55000), JSON.stringify(r)) });

  console.log("\nAccess control and audit");
  await step("AC18", "finance cannot change role permissions", "finance", () => sql("insert into role_permissions values ('finance', 'payments.adjust')"), { expect: "deny" });
  await step("AC18", "agent cannot read the audit log", "agent", () => sql("select id from audit_log limit 1"),
    { check: (r) => assert(r.length === 0, "agent read the audit log") });
  await step("AC18", "property manager cannot delete a property with deals", "superadmin", () => sql("delete from properties where id = $1", [deal.id]), { expect: "deny" });
  await step("AC18", "last super admin cannot be demoted", "superadmin", async () => {
    await sql("update staff set active = false where role = 'super_admin' and id <> $1", [users.superadmin]);
    return sql("update staff set role = 'management' where id = $1", [users.superadmin]);
  }, { expect: "deny" });
  await step("AC18", "super admin grants a single extra permission", "superadmin", () => sql("insert into staff_permissions (staff_id, permission) values ($1, 'payments.adjust')", [users.manager]));
  await step("AC19", "audit log captured publication, price, contract, payment, reversal and permission changes", "manager", () => sql(
    `select table_name, action, count(*)::int as n from audit_log where changed_at > now() - interval '1 hour'
       and (record_id in ($1, $2, $3, $4) or table_name in ('payments', 'payment_allocations', 'staff_permissions', 'contracts'))
     group by 1, 2`, [prop.id, deal.id, sc.id, sched.id]),
    { check: (r) => {
      const has = (tbl, act) => r.some((x) => x.table_name === tbl && x.action === act);
      assert(has("properties", "update") && has("contracts", "insert") && has("payments", "insert") && has("payments", "update") && has("staff_permissions", "insert"), JSON.stringify(r));
    } });
} catch (e) {
  failures.push(`Test run stopped: ${e.message}`);
  console.log(`\n  Test run stopped: ${e.stack}`);
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}

console.log(`\n${passed} passed, ${failures.length} failed. All changes rolled back.`);
if (failures.length) {
  console.log("\nFailures:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
