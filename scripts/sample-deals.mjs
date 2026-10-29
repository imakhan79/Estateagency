// Loads demo deals so every part of the back office has something to show: a completed sale with
// commissions, a sale on installments, two active rentals (one about to expire), a deal awaiting
// approval, and leads with follow-ups. Runs once; re-running does nothing.
// Usage: npm run db:sample-deals   (needs the demo accounts: npm run db:demo-users)
import pg from "pg";

const MARK = "[sample data]";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, params) => (await client.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

try {
  if ((await q("select 1 from public.customers where notes = $1 limit 1", [MARK])).length) {
    console.log("Sample deals are already loaded.");
    process.exit(0);
  }
  const agent = await one("select id from public.staff where email = 'agent@demo.local'");
  if (!agent) throw new Error("Create the demo accounts first: npm run db:demo-users");

  await client.query("begin");

  const prop = async (slug) => (await one("select id, ref from public.properties where slug = $1", [slug]));
  const status = async (table, slug) => (await one(`select id from public.${table} where slug = $1`, [slug])).id;
  const contractType = async (slug) => status("contract_types", slug);
  const customer = async (name, mobile, cnic, cats) => {
    const c = await one("insert into public.customers (full_name, mobile, cnic, notes) values ($1, $2, $3, $4) returning id", [name, mobile, cnic, MARK]);
    for (const cat of cats) {
      await q("insert into public.customer_categories select $1, id from public.party_categories where slug = $2", [c.id, cat]);
    }
    return c.id;
  };
  const pay = (customerId, schedule, amount, paidOn, method, ref) =>
    q("select public.record_payment($1, $2, $3::date, $4, $5, null, 'PKR', null, $6)", [customerId, amount, paidOn, method, ref, schedule]);
  const installments = async (schedule, rows) => {
    let seq = 0;
    for (const [description, due, amount] of rows) {
      await q("insert into public.installments (schedule_id, seq, description, due_date, amount) values ($1, $2, $3, $4, $5)", [schedule, ++seq, description, due, amount]);
    }
  };

  const bahria = await prop("bahria-town-10-marla-house");
  const e11 = await prop("e-11-islamabad-upper-portion-rent");
  const gulberg = await prop("gulberg-2-bed-apartment");
  const clifton = await prop("clifton-sea-view-apartment-rent");
  const dha = await prop("dha-phase-6-1-kanal-house");

  const ayesha = await customer("Ayesha Siddiqui", "0300 4567812", "35202-4567812-4", ["buyer"]);
  const kamran = await customer("Kamran Haider", "0321 7788990", "35201-7788990-1", ["seller"]);
  const bilal = await customer("Bilal Ahmed", "0333 1234098", "61101-1234098-7", ["tenant"]);
  const nadia = await customer("Nadia Farooq", "0345 9081726", "61101-9081726-2", ["landlord"]);
  const usman = await customer("Usman Tariq", "0302 6655443", "35202-6655443-9", ["buyer", "investor"]);
  const sana = await customer("Sana Malik", "0312 2233445", "35201-2233445-6", ["seller"]);
  const hamza = await customer("Hamza Qureshi", "0300 9988776", "42101-9988776-3", ["tenant"]);
  const farah = await customer("Farah Javed", "0322 5566778", "42201-5566778-8", ["landlord"]);
  const zubair = await customer("Zubair Khan", "0301 1122334", null, ["other"]);
  const omar = await customer("Omar Sheikh", "0331 4455667", "35202-4455667-5", ["buyer"]);

  await q(`update public.properties set owner_id = $2, listing_authorization = $3, agent_id = $4 where id = $1`, [bahria.id, kamran, "exclusive", agent.id]);
  await q(`update public.properties set owner_id = $2, listing_authorization = $3, agent_id = $4 where id = $1`, [e11.id, nadia, "non_exclusive", agent.id]);
  await q(`update public.properties set owner_id = $2, listing_authorization = $3, agent_id = $4 where id = $1`, [gulberg.id, sana, "exclusive", agent.id]);
  await q(`update public.properties set owner_id = $2, listing_authorization = $3, agent_id = $4 where id = $1`, [clifton.id, farah, "non_exclusive", agent.id]);
  await q(`update public.properties set listing_authorization = 'exclusive', agent_id = $2 where id = $1`, [dha.id, agent.id]);

  // 1. Completed sale: Bahria Town house, 42.5M, fully paid -> commissions calculated automatically.
  const lead1 = await one(`insert into public.leads (name, mobile, inquiry_type, property_id, source_id, status_id, assigned_to, customer_id, converted_at, requirement)
    values ('Ayesha Siddiqui', '0300 4567812', 'buy', $1, (select id from public.lead_sources where slug = 'website-inquiry'),
            (select id from public.lead_statuses where slug = 'won'), $2, $3, now() - interval '70 days', 'Looking for a 10 marla house near schools in Bahria Town')
    returning id`, [bahria.id, agent.id, ayesha]);
  const tx1 = await one(`insert into public.transactions (kind, property_id, lead_id, status_id, transaction_date, agreed_price, deposit, agent_id, approval_status, payment_terms)
    values ('sale', $1, $2, $3, current_date - 60, 42500000, 4250000, $4, 'approved', '10% deposit on signing, balance on transfer') returning id, ref`,
    [bahria.id, lead1.id, await status("transaction_statuses", "payment-in-progress"), agent.id]);
  await q("insert into public.transaction_parties values ($1, $2, 'buyer'), ($1, $3, 'seller')", [tx1.id, ayesha, kamran]);
  await q(`insert into public.contracts (type_id, status, property_id, transaction_id, start_date, signed_on, value, responsible_id, title)
    values ($1, 'active', $2, $3, current_date - 55, current_date - 55, 42500000, $4, 'Sale agreement — 10 marla, Bahria Town')`,
    [await contractType("sale"), bahria.id, tx1.id, agent.id]).then(async () => {
      const c = await one("select id from public.contracts where transaction_id = $1", [tx1.id]);
      await q("insert into public.contract_parties values ($1, $2, 'buyer'), ($1, $3, 'seller')", [c.id, ayesha, kamran]);
    });
  const s1 = await one(`insert into public.payment_schedules (title, customer_id, property_id, transaction_id, payment_type, notes)
    values ('Sale price — ' || $4, $1, $2, $3, 'installments', 'Deposit and balance') returning id`, [ayesha, bahria.id, tx1.id, bahria.ref]);
  await installments(s1.id, [["Deposit (10%)", daysAgo(55), 4250000], ["Balance on transfer", daysAgo(20), 38250000]]);
  await pay(ayesha, s1.id, 4250000, daysAgo(55), "pay_order", "PO-118823 HBL");
  await pay(ayesha, s1.id, 38250000, daysAgo(18), "bank_transfer", "IBFT 7781203");
  await q("update public.transactions set status_id = $2 where id = $1", [tx1.id, await status("transaction_statuses", "completed")]);
  await q("update public.properties set availability = 'sold' where id = $1", [bahria.id]);
  // Move commissions along: buyer brokerage received, seller brokerage and agent share approved.
  await q(`update public.commissions set status = 'approved', approved_at = now() where transaction_id = $1`, [tx1.id]);
  await q(`update public.commissions set status = 'paid', paid_on = current_date - 15, payment_method = 'bank_transfer', payment_reference = 'IBFT 7790011'
           where transaction_id = $1 and kind = 'brokerage' and payer_customer_id = $2`, [tx1.id, ayesha]);
  await q(`insert into public.commissions (kind, property_id, transaction_id, description, basis, amount, payee_customer_id, due_date, notes)
           values ('referral', $1, $2, 'Referral fee — introduced the buyer', 'fixed', 50000, $3, current_date + 10, 'Agreed verbally with Zubair')`,
    [bahria.id, tx1.id, zubair]);

  // 2. Rental about to expire: E-11 upper portion, 150k/month, one year ending tomorrow.
  const ct2 = await one(`insert into public.contracts (type_id, status, property_id, start_date, end_date, signed_on, rent_amount, security_deposit,
      payment_frequency, payment_due_day, renewal_status, responsible_id, title, renewal_terms)
    values ($1, 'draft', $2, date_trunc('month', current_date)::date - interval '11 months', date_trunc('month', current_date)::date + interval '1 month' - interval '1 day',
            date_trunc('month', current_date)::date - interval '11 months' - interval '5 days', 150000, 300000, 'monthly', 5, 'discussion', $3,
            'Tenancy — upper portion, E-11/2', 'Renewable for one year at up to 10% increase by mutual agreement')
    returning id`, [await contractType("rental"), e11.id, agent.id]);
  await q("insert into public.contract_parties values ($1, $2, 'tenant'), ($1, $3, 'landlord')", [ct2.id, bilal, nadia]);
  await q("update public.contracts set status = 'active', next_action_date = current_date + 1 where id = $1", [ct2.id]);
  const s2 = (await one("select public.create_rent_schedule($1) as id", [ct2.id])).id;
  const rent2 = await q("select id, due_date::text, amount from public.installments where schedule_id = $1 order by seq", [s2]);
  for (const i of rent2) {
    const due = new Date(i.due_date);
    if (due < new Date(Date.now() - 25 * 86400000)) await pay(bilal, s2, Number(i.amount), i.due_date, i.description === "Security deposit" ? "cheque" : "bank_transfer", "Rent " + i.due_date.slice(0, 7));
    else if (due < new Date()) await pay(bilal, s2, 100000, i.due_date, "cash", "Part payment");
  }
  await q("update public.properties set availability = 'rented' where id = $1", [e11.id]);
  await q(`update public.commissions set status = 'approved', approved_at = now() where contract_id = $1`, [ct2.id]);
  await q(`update public.commissions set status = 'paid', paid_on = (select start_date from public.contracts where id = $1), payment_method = 'cash'
           where contract_id = $1 and kind = 'brokerage'`, [ct2.id]);
  await q(`update public.commissions set status = 'paid', paid_on = (select start_date + 30 from public.contracts where id = $1), payment_method = 'bank_transfer', payment_reference = 'Salary run'
           where contract_id = $1 and kind = 'agent'`, [ct2.id]);

  // 3. Sale being paid in installments: Gulberg apartment, 28M in 4 monthly installments.
  const tx3 = await one(`insert into public.transactions (kind, property_id, status_id, transaction_date, agreed_price, deposit, agent_id, approval_status, payment_terms)
    values ('sale', $1, $2, current_date - 95, 28000000, 7000000, $3, 'approved', 'Four equal monthly installments; possession on final payment') returning id, ref`,
    [gulberg.id, await status("transaction_statuses", "payment-in-progress"), agent.id]);
  await q("insert into public.transaction_parties values ($1, $2, 'buyer'), ($1, $3, 'seller')", [tx3.id, usman, sana]);
  const ct3 = await one(`insert into public.contracts (type_id, status, property_id, transaction_id, start_date, signed_on, value, responsible_id, title)
    values ($1, 'active', $2, $3, current_date - 90, current_date - 90, 28000000, $4, 'Sale agreement — apartment 8-B, Gulberg III') returning id`,
    [await contractType("sale"), gulberg.id, tx3.id, agent.id]);
  await q("insert into public.contract_parties values ($1, $2, 'buyer'), ($1, $3, 'seller')", [ct3.id, usman, sana]);
  const s3 = await one(`insert into public.payment_schedules (title, customer_id, property_id, transaction_id, payment_type)
    values ('Sale price — ' || $4, $1, $2, $3, 'installments') returning id`, [usman, gulberg.id, tx3.id, gulberg.ref]);
  await installments(s3.id, [
    ["Installment 1 of 4", monthOffset(-2), 7000000], ["Installment 2 of 4", monthOffset(-1), 7000000],
    ["Installment 3 of 4", monthOffset(0), 7000000], ["Installment 4 of 4", monthOffset(1), 7000000],
  ]);
  await pay(usman, s3.id, 7000000, monthOffset(-2), "pay_order", "PO-55120 MCB");
  await pay(usman, s3.id, 7000000, monthOffset(-1), "bank_transfer", "IBFT 6650921");
  await pay(usman, s3.id, 3000000, monthOffset(0, 3), "cheque", "Chq 004512 Meezan");
  await q("update public.properties set availability = 'under_offer' where id = $1", [gulberg.id]);

  // 4. New rental: Clifton apartment, 350k/month, started this month; commissions pending approval.
  const ct4 = await one(`insert into public.contracts (type_id, status, property_id, start_date, end_date, signed_on, rent_amount, security_deposit, advance_rent,
      payment_frequency, payment_due_day, renewal_status, responsible_id, title)
    values ($1, 'draft', $2, date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + interval '1 year' - interval '1 day',
            date_trunc('month', current_date)::date - 3, 350000, 700000, 350000, 'monthly', 1, 'not_contacted', $3, 'Tenancy — apartment, Block 2 Clifton')
    returning id`, [await contractType("rental"), clifton.id, agent.id]);
  await q("insert into public.contract_parties values ($1, $2, 'tenant'), ($1, $3, 'landlord')", [ct4.id, hamza, farah]);
  await q("update public.contracts set status = 'active' where id = $1", [ct4.id]);
  const s4 = (await one("select public.create_rent_schedule($1) as id", [ct4.id])).id;
  await pay(hamza, s4, 1050000, monthOffset(0), "bank_transfer", "IBFT 9921177");   // deposit + advance
  await pay(hamza, s4, 350000, monthOffset(0), "bank_transfer", "IBFT 9921178");    // first month
  await q("update public.properties set availability = 'rented' where id = $1", [clifton.id]);

  // 5. Deal awaiting approval: DHA Phase 6 house, offer of 92M.
  const lead5 = await one(`insert into public.leads (name, mobile, inquiry_type, property_id, source_id, status_id, assigned_to, customer_id, priority, budget_max, requirement, next_follow_up_at)
    values ('Omar Sheikh', '0331 4455667', 'buy', $1, (select id from public.lead_sources where slug = 'referral'),
            (select id from public.lead_statuses where slug = 'offer'), $2, $3, 'high', 95000000, 'Wants possession before March; paying from sale of current house', now() + interval '1 day')
    returning id`, [dha.id, agent.id, omar]);
  const tx5 = await one(`insert into public.transactions (kind, property_id, lead_id, status_id, agreed_price, deposit, agent_id, approval_status, payment_terms, notes)
    values ('sale', $1, $2, $3, 92000000, 9200000, $4, 'pending', '10% on signing, balance within 60 days', 'Owner asked 95M; buyer offered 92M') returning id`,
    [dha.id, lead5.id, await status("transaction_statuses", "offer-submitted"), agent.id]);
  await q("insert into public.transaction_parties values ($1, $2, 'buyer')", [tx5.id, omar]);
  await q("update public.properties set availability = 'under_offer' where id = $1", [dha.id]);

  // Open leads with follow-ups for the agent.
  for (const [name, mobile, type, slug, statusSlug, due, note] of [
    ["Rashid Mehmood", "0300 7766554", "rent", "blue-area-office-rent", "viewing-scheduled", 1, "Viewing booked with operations manager"],
    ["Maryam Aziz", "0334 2211009", "buy", "bahria-enclave-residential-plot", "contacted", -2, "Call back about payment plan"],
    ["Tariq Jamil", "0315 6677889", "buy", "dha-phase-8-commercial-plot", "qualified", 3, "Send plot map and dues clearance"],
  ]) {
    const p = await prop(slug);
    const l = await one(`insert into public.leads (name, mobile, inquiry_type, property_id, source_id, status_id, assigned_to, next_follow_up_at)
      values ($1, $2, $3, $4, (select id from public.lead_sources where slug = 'phone'), (select id from public.lead_statuses where slug = $5), $6, now() + make_interval(days => $7))
      returning id`, [name, mobile, type, p.id, statusSlug, agent.id, due]);
    await q(`insert into public.activities (kind, lead_id, property_id, subject, due_at, assigned_to)
      values ($1, $2, $3, $4, now() + make_interval(days => $5), $6)`, [statusSlug === "viewing-scheduled" ? "visit" : "call", l.id, p.id, note, due, agent.id]);
  }

  await client.query("commit");

  const reminders = await one("select public.run_daily_reminders() as n");
  const summary = await one(`select (select count(*) from public.commissions) as commissions, (select count(*) from public.transactions) as transactions,
      (select count(*) from public.contracts) as contracts, (select count(*) from public.payments) as payments`);
  console.log(`Loaded: ${summary.transactions} transactions, ${summary.contracts} contracts, ${summary.payments} payments, ${summary.commissions} commissions; ${reminders.n} reminders queued.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// First day of a month relative to this one (plus an optional day offset), as YYYY-MM-DD.
function monthOffset(months, day = 1) {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + months, day)).toISOString().slice(0, 10);
}
