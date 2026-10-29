-- 0012: payments and payment allocations are separate (BRD §16.1).
-- A payment belongs to a customer; allocations apply it to one or more installments.
-- One payment can cover several installments, and an installment can receive several payments.

create table public.payment_allocations (
  id              uuid primary key default gen_random_uuid(),
  payment_id      uuid not null references public.payments (id) on delete restrict,
  installment_id  uuid not null references public.installments (id) on delete restrict,
  amount          numeric(14, 2) not null check (amount > 0),
  created_by      uuid references public.staff (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (payment_id, installment_id)
);
create index payment_allocations_installment_idx on public.payment_allocations (installment_id);
create index payment_allocations_created_by_idx on public.payment_allocations (created_by);

alter table public.payments add column direction text not null default 'incoming' check (direction in ('incoming', 'outgoing'));

-- Move existing links into allocations.
insert into public.payment_allocations (payment_id, installment_id, amount, created_by, created_at)
select id, installment_id, amount, recorded_by, recorded_at from public.payments;
update public.payments p set direction = s.direction from public.payment_schedules s where s.id = p.schedule_id;

-- Drop everything that read payments.installment_id / schedule_id, then the columns.
drop view public.payment_receipts;
drop view public.schedule_balances;
drop view public.installment_balances;
drop view public.report_collections;
drop policy "Record deleters" on public.payment_schedules;
drop policy "Payment recorders manage unpaid installments" on public.installments;
drop trigger payments_before_insert on public.payments;
drop function public.payments_before_insert();
alter table public.payments drop column installment_id, drop column schedule_id;

create or replace function public.payments_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  new.recorded_at := now();
  new.voided_at := null;
  new.voided_by := null;
  return new;
end;
$$;

create trigger payments_before_insert before insert on public.payments
  for each row execute function public.payments_before_insert();

create or replace function public.payment_allocations_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_inst public.installments;
  v_sched public.payment_schedules;
  v_allocated numeric;
  v_paid numeric;
begin
  select * into v_payment from public.payments where id = new.payment_id;
  select * into v_inst from public.installments where id = new.installment_id;
  select * into v_sched from public.payment_schedules where id = v_inst.schedule_id;

  if v_payment.voided_at is not null then raise exception 'This payment has been reversed'; end if;
  if v_inst.cancelled_at is not null or v_inst.waived_at is not null or v_sched.cancelled_at is not null then
    raise exception 'Installment "%" is cancelled', v_inst.description;
  end if;
  if v_sched.customer_id <> v_payment.customer_id then
    raise exception 'Installment "%" belongs to a different customer', v_inst.description;
  end if;
  if v_sched.currency <> v_payment.currency then
    raise exception 'Installment "%" is in %, the payment is in %', v_inst.description, v_sched.currency, v_payment.currency;
  end if;

  select coalesce(sum(amount), 0) into v_allocated from public.payment_allocations where payment_id = new.payment_id;
  if v_allocated + new.amount > v_payment.amount then
    raise exception 'Allocations exceed the payment amount by %', v_allocated + new.amount - v_payment.amount;
  end if;

  select coalesce(sum(a.amount), 0) into v_paid
  from public.payment_allocations a join public.payments p on p.id = a.payment_id
  where a.installment_id = new.installment_id and p.voided_at is null;
  if v_paid + new.amount > v_inst.amount and auth.uid() is not null and not public.has_permission('payments.adjust') then
    raise exception 'Payment of % exceeds the outstanding % on "%"', new.amount, v_inst.amount - v_paid, v_inst.description;
  end if;

  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

create trigger payment_allocations_before_insert before insert on public.payment_allocations
  for each row execute function public.payment_allocations_before_insert();

create or replace function public.payment_allocations_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Payment allocations cannot be changed. Reverse the payment and record it again.';
end;
$$;

create trigger payment_allocations_immutable before update or delete on public.payment_allocations
  for each row execute function public.payment_allocations_immutable();

create trigger payment_allocations_audit after insert or update or delete on public.payment_allocations
  for each row execute function public.audit_trigger();

-- Records a payment and allocates it in one step. Either pass explicit allocations
-- ([{"installment_id": ..., "amount": ...}]) or a schedule to fill oldest-first.
create or replace function public.record_payment(
  p_customer uuid, p_amount numeric, p_paid_on date, p_method text,
  p_reference text default null, p_notes text default null, p_currency text default 'PKR',
  p_allocations jsonb default null, p_schedule uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_payment uuid;
  v_left numeric := p_amount;
  v_take numeric;
  v_direction text;
  r record;
begin
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if p_paid_on > current_date then raise exception 'The payment date cannot be in the future'; end if;

  v_direction := coalesce(
    (select direction from public.payment_schedules where id = p_schedule),
    (select s.direction from public.installments i join public.payment_schedules s on s.id = i.schedule_id
      where i.id = (p_allocations -> 0 ->> 'installment_id')::uuid),
    'incoming');

  insert into public.payments (customer_id, amount, currency, paid_on, method, reference_no, notes, direction)
  values (p_customer, p_amount, p_currency, p_paid_on, p_method, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), v_direction)
  returning id into v_payment;

  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    insert into public.payment_allocations (payment_id, installment_id, amount)
    select v_payment, (a ->> 'installment_id')::uuid, (a ->> 'amount')::numeric
    from jsonb_array_elements(p_allocations) a
    where (a ->> 'amount')::numeric > 0;
  elsif p_schedule is not null then
    for r in
      select b.id, b.outstanding from public.installment_balances b
      where b.schedule_id = p_schedule and b.outstanding > 0 and b.status <> 'disputed'
      order by b.due_date, b.seq
    loop
      exit when v_left <= 0;
      v_take := least(v_left, r.outstanding);
      insert into public.payment_allocations (payment_id, installment_id, amount) values (v_payment, r.id, v_take);
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 and auth.uid() is not null and not public.has_permission('payments.adjust') then
      raise exception 'The payment is % more than the outstanding balance on this schedule', v_left;
    end if;
  end if;

  return v_payment;
end;
$$;
grant execute on function public.record_payment(uuid, numeric, date, text, text, text, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Balances, receipts and collections rebuilt on allocations
-- ---------------------------------------------------------------------------

create view public.installment_balances with (security_invoker = true) as
select
  i.id, i.schedule_id, s.ref as schedule_ref, s.title as schedule_title, s.payment_type, s.customer_id, s.property_id,
  s.contract_id, s.transaction_id, s.direction, s.currency,
  i.seq, i.description, i.due_date, i.amount,
  coalesce(p.paid, 0) as paid,
  case when i.waived_at is not null or i.cancelled_at is not null or s.cancelled_at is not null then 0
       else greatest(i.amount - coalesce(p.paid, 0), 0) end as outstanding,
  p.last_paid_on,
  case
    when i.cancelled_at is not null or s.cancelled_at is not null or i.waived_at is not null then 'cancelled'
    when i.disputed_at is not null then 'disputed'
    when coalesce(p.paid, 0) >= i.amount then 'paid'
    when i.due_date < current_date then 'overdue'
    when coalesce(p.paid, 0) > 0 then 'partially_paid'
    when i.due_date <= current_date + 7 then 'due'
    else 'upcoming'
  end as status,
  case when i.waived_at is null and i.cancelled_at is null and s.cancelled_at is null
            and coalesce(p.paid, 0) < i.amount and i.due_date < current_date
       then current_date - i.due_date else 0 end as days_overdue,
  i.disputed_at, i.status_note
from public.installments i
join public.payment_schedules s on s.id = i.schedule_id
left join (
  select a.installment_id, sum(a.amount) as paid, max(pm.paid_on) as last_paid_on
  from public.payment_allocations a join public.payments pm on pm.id = a.payment_id
  where pm.voided_at is null
  group by a.installment_id
) p on p.installment_id = i.id;

create view public.schedule_balances with (security_invoker = true) as
select
  s.id, s.ref, s.title, s.payment_type, s.customer_id, s.property_id, s.contract_id, s.transaction_id, s.direction,
  s.currency, s.cancelled_at,
  coalesce(sum(b.amount) filter (where b.status <> 'cancelled'), 0) as total,
  coalesce(sum(b.paid), 0) as paid,
  coalesce(sum(b.outstanding), 0) as outstanding,
  coalesce(sum(b.outstanding) filter (where b.status = 'overdue'), 0) as overdue,
  min(b.due_date) filter (where b.outstanding > 0) as next_due_date,
  count(b.id) as installment_count,
  case
    when s.cancelled_at is not null then 'cancelled'
    when bool_or(b.status = 'disputed') then 'disputed'
    when coalesce(sum(b.outstanding), 0) = 0 then 'paid'
    when bool_or(b.status = 'overdue') then 'overdue'
    when sum(b.paid) > 0 then 'partially_paid'
    when bool_or(b.status = 'due') then 'due'
    else 'upcoming'
  end as status
from public.payment_schedules s
left join public.installment_balances b on b.schedule_id = s.id
group by s.id;

create view public.payment_receipts with (security_invoker = true) as
select
  p.id, p.receipt_no, p.paid_on, p.amount, p.currency, p.method, p.reference_no, p.notes, p.recorded_at, p.direction,
  p.voided_at, p.void_type, p.void_reason,
  cu.id as customer_id, cu.ref as customer_ref, cu.full_name as customer_name, cu.mobile as customer_mobile,
  coalesce(a.allocated, 0) as allocated,
  p.amount - coalesce(a.allocated, 0) as unallocated,
  a.allocations, a.schedule_ids, a.property_refs, a.schedule_refs, a.installments,
  (select coalesce(sum(sb.outstanding), 0) from public.schedule_balances sb where sb.id = any (a.schedule_ids)) as schedule_outstanding,
  st.full_name as recorded_by_name,
  (select value from public.settings where key = 'business') as business
from public.payments p
join public.customers cu on cu.id = p.customer_id
left join public.staff st on st.id = p.recorded_by
left join lateral (
  select
    sum(al.amount) as allocated,
    jsonb_agg(jsonb_build_object(
      'installment_id', i.id, 'installment', i.description, 'due_date', i.due_date, 'amount', al.amount,
      'installment_outstanding', ib.outstanding, 'schedule_id', s.id, 'schedule_ref', s.ref, 'schedule_title', s.title,
      'property_ref', pr.ref, 'property_title', pr.title, 'contract_ref', c.ref, 'transaction_ref', t.ref
    ) order by i.due_date, i.seq) as allocations,
    array_agg(distinct s.id) as schedule_ids,
    string_agg(distinct pr.ref, ', ') as property_refs,
    string_agg(distinct s.ref, ', ') as schedule_refs,
    string_agg(i.description, ', ' order by i.due_date) as installments
  from public.payment_allocations al
  join public.installments i on i.id = al.installment_id
  join public.installment_balances ib on ib.id = i.id
  join public.payment_schedules s on s.id = i.schedule_id
  join public.properties pr on pr.id = s.property_id
  left join public.contracts c on c.id = s.contract_id
  left join public.transactions t on t.id = s.transaction_id
  where al.payment_id = p.id
) a on true;

create view public.report_collections with (security_invoker = true) as
select date_trunc('month', p.paid_on)::date as month, p.currency, p.method, p.direction,
       count(*) as payments, sum(p.amount) as amount
from public.payments p
where p.voided_at is null
group by 1, 2, 3, 4;

grant select on public.installment_balances, public.schedule_balances, public.payment_receipts, public.report_collections to authenticated;

-- ---------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------

alter table public.payment_allocations enable row level security;
grant select, insert on public.payment_allocations to authenticated;
create policy "Payment viewers" on public.payment_allocations for select to authenticated
  using ((select public.has_permission('payments.view')));
create policy "Payment recorders" on public.payment_allocations for insert to authenticated
  with check ((select public.has_permission('payments.record')));

create policy "Record deleters" on public.payment_schedules for delete to authenticated
  using ((select public.has_permission('records.delete'))
         and not exists (select 1 from public.payment_allocations a join public.installments i on i.id = a.installment_id
                         where i.schedule_id = payment_schedules.id));

create policy "Payment recorders manage unpaid installments" on public.installments for all to authenticated
  using ((select public.has_permission('payments.record'))
         and not exists (select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
                         where a.installment_id = installments.id and p.voided_at is null))
  with check ((select public.has_permission('payments.record')));

-- Disputes, cancellations and notes are status changes allowed even after payments exist.
create policy "Payment recorders flag installments" on public.installments for update to authenticated
  using ((select public.has_permission('payments.record'))) with check (true);

create or replace function public.installments_guard_paid()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.amount is distinct from old.amount or new.due_date is distinct from old.due_date or new.schedule_id is distinct from old.schedule_id)
     and exists (select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
                 where a.installment_id = old.id and p.voided_at is null) then
    raise exception 'Payments have been recorded against this installment, so its amount and due date are locked';
  end if;
  if new.cancelled_at is not null and old.cancelled_at is null and auth.uid() is not null and not public.has_permission('payments.adjust') then
    raise exception 'You do not have permission to cancel installments';
  end if;
  if new.waived_at is not null and old.waived_at is null then
    if auth.uid() is not null and not public.has_permission('payments.adjust') then
      raise exception 'You do not have permission to waive installments';
    end if;
    new.waived_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger installments_guard_paid before update on public.installments
  for each row execute function public.installments_guard_paid();

create or replace function public.schedules_guard_cancel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cancelled_at is not null and old.cancelled_at is null and auth.uid() is not null and not public.has_permission('payments.adjust') then
    raise exception 'You do not have permission to cancel payment schedules';
  end if;
  return new;
end;
$$;

create trigger schedules_guard_cancel before update on public.payment_schedules
  for each row execute function public.schedules_guard_cancel();

-- Dashboard: only money received counts as received (purchase payouts are outgoing).
create or replace function public.dashboard_summary(p_from date default null, p_to date default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select coalesce(p_from, date_trunc('month', current_date)::date) as d_from, coalesce(p_to, current_date) as d_to
  )
  select jsonb_build_object(
    'period', (select jsonb_build_object('from', d_from, 'to', d_to) from bounds),
    'properties', (select jsonb_build_object(
        'total', count(*),
        'available', count(*) filter (where availability = 'available' and publication <> 'archived'),
        'for_sale', count(*) filter (where listing_type = 'sale' and publication = 'published'),
        'for_rent', count(*) filter (where listing_type = 'rent' and publication = 'published'),
        'sold', count(*) filter (where availability = 'sold'),
        'rented', count(*) filter (where availability = 'rented'),
        'archived', count(*) filter (where publication = 'archived'))
      from public.properties),
    'leads', (select jsonb_build_object(
        'new_in_period', count(*) filter (where l.created_at::date between b.d_from and b.d_to),
        'unassigned', count(*) filter (where l.assigned_to is null and not ls.is_closed),
        'awaiting_follow_up', count(*) filter (where not ls.is_closed and l.next_follow_up_at <= now()),
        'active_negotiations', count(*) filter (where ls.slug in ('negotiation', 'offer', 'contract-preparation')))
      from public.leads l join public.lead_statuses ls on ls.id = l.status_id cross join bounds b),
    'follow_ups_overdue', (select count(*) from public.activities where completed_at is null and due_at < now()),
    'transactions_in_progress', (select count(*) from public.transactions t
        join public.transaction_statuses s on s.id = t.status_id where not s.is_closed),
    'transactions_pending_approval', (select count(*) from public.transactions where approval_status = 'pending'),
    'contracts', (select jsonb_build_object(
        'active_rentals', count(*) filter (where c.status in ('active', 'expiring_soon') and ct.slug in ('rental', 'lease', 'renewal')),
        'active', count(*) filter (where c.status in ('active', 'expiring_soon')),
        'expiring_soon', count(*) filter (where c.status = 'expiring_soon'
          or (c.status = 'active' and c.end_date <= current_date + 30)))
      from public.contracts c join public.contract_types ct on ct.id = c.type_id),
    'payments', (select jsonb_build_object(
        'received_in_period', coalesce((select sum(p.amount) from public.payments p cross join bounds b
            where p.voided_at is null and p.direction = 'incoming' and p.paid_on between b.d_from and b.d_to), 0),
        'outstanding', coalesce(sum(outstanding) filter (where direction = 'incoming'), 0),
        'overdue', coalesce(sum(outstanding) filter (where direction = 'incoming' and status = 'overdue'), 0),
        'upcoming_30_days', coalesce(sum(outstanding) filter (where direction = 'incoming'
            and status in ('due', 'upcoming', 'partially_paid') and due_date <= current_date + 30), 0))
      from public.installment_balances)
  );
$$;
