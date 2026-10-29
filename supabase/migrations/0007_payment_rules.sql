-- 0007: payment details from BRD §10 — payment types, cancelled/disputed installments,
-- typed reversals, and protection against duplicate schedules.

alter table public.payment_schedules
  add column payment_type text not null default 'installments'
    check (payment_type in ('full', 'installments', 'rent', 'advance', 'security_deposit', 'other')),
  add column cancelled_at timestamptz;

-- One live schedule of each type per contract or transaction (BRD §10.5 "prevent accidental duplication").
create unique index payment_schedules_contract_type_uniq on public.payment_schedules (contract_id, payment_type)
  where contract_id is not null and cancelled_at is null;
create unique index payment_schedules_transaction_type_uniq on public.payment_schedules (transaction_id, payment_type)
  where transaction_id is not null and cancelled_at is null;

alter table public.payment_schedules
  add constraint payment_schedules_reference_check check (contract_id is not null or transaction_id is not null) not valid;

alter table public.installments
  add column cancelled_at timestamptz,
  add column disputed_at timestamptz,
  add column status_note text;

-- Reversals keep the original row and say why (BRD §10.9).
alter table public.payments
  add column void_type text check (void_type in ('entry_error', 'duplicate', 'dishonoured_cheque', 'cancelled', 'other'));
alter table public.payments drop constraint payments_check;
alter table public.payments
  add constraint payments_void_check check (voided_at is null or (void_reason is not null and void_type is not null));

create or replace function public.payments_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason', 'void_type', 'notes'])
     is distinct from (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason', 'void_type', 'notes']) then
    raise exception 'Payments cannot be edited. Reverse the payment and record it again.';
  end if;
  if old.voided_at is not null and (new.voided_at is distinct from old.voided_at or new.void_type is distinct from old.void_type) then
    raise exception 'A reversed payment cannot be changed';
  end if;
  if new.voided_at is not null and old.voided_at is null then
    if auth.uid() is not null and not public.has_permission('payments.adjust') then
      raise exception 'You do not have permission to reverse payments';
    end if;
    new.voided_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Installment status per BRD §10.7: Upcoming, Due, Partially Paid, Paid, Overdue, Cancelled, Disputed.
drop view public.schedule_balances;
drop view public.installment_balances;
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
       then current_date - i.due_date else 0 end as days_overdue
from public.installments i
join public.payment_schedules s on s.id = i.schedule_id
left join (
  select installment_id, sum(amount) as paid, max(paid_on) as last_paid_on
  from public.payments where voided_at is null group by installment_id
) p on p.installment_id = i.id;

create view public.schedule_balances with (security_invoker = true) as
select
  s.id, s.ref, s.title, s.payment_type, s.customer_id, s.property_id, s.contract_id, s.transaction_id, s.direction,
  s.currency, s.cancelled_at,
  sum(b.amount) filter (where b.status <> 'cancelled') as total,
  sum(b.paid) as paid,
  sum(b.outstanding) as outstanding,
  coalesce(sum(b.outstanding) filter (where b.status = 'overdue'), 0) as overdue,
  min(b.due_date) filter (where b.outstanding > 0) as next_due_date,
  count(*) as installment_count,
  case
    when s.cancelled_at is not null then 'cancelled'
    when bool_or(b.status = 'disputed') then 'disputed'
    when sum(b.outstanding) = 0 then 'paid'
    when bool_or(b.status = 'overdue') then 'overdue'
    when sum(b.paid) > 0 then 'partially_paid'
    when bool_or(b.status = 'due') then 'due'
    else 'upcoming'
  end as status
from public.payment_schedules s
join public.installment_balances b on b.schedule_id = s.id
group by s.id;

-- Receipt data (BRD §10.8): built from the recorded payment, never the other way round.
create view public.payment_receipts with (security_invoker = true) as
select
  p.id, p.receipt_no, p.paid_on, p.amount, p.currency, p.method, p.reference_no, p.notes, p.recorded_at,
  p.voided_at, p.void_type, p.void_reason,
  cu.ref as customer_ref, cu.full_name as customer_name, cu.mobile as customer_mobile,
  pr.ref as property_ref, pr.title as property_title,
  s.ref as schedule_ref, s.title as schedule_title,
  c.ref as contract_ref, t.ref as transaction_ref,
  i.description as installment, b.outstanding as installment_outstanding,
  sb.outstanding as schedule_outstanding,
  st.full_name as recorded_by_name,
  (select value from public.settings where key = 'business') as business
from public.payments p
join public.customers cu on cu.id = p.customer_id
join public.payment_schedules s on s.id = p.schedule_id
join public.properties pr on pr.id = s.property_id
join public.installments i on i.id = p.installment_id
join public.installment_balances b on b.id = p.installment_id
join public.schedule_balances sb on sb.id = s.id
left join public.contracts c on c.id = s.contract_id
left join public.transactions t on t.id = s.transaction_id
left join public.staff st on st.id = p.recorded_by;

revoke all on public.payment_receipts from anon, authenticated;
grant select on public.payment_receipts, public.installment_balances, public.schedule_balances to authenticated;

-- Reminders skip disputed installments (cancelled ones already have nothing outstanding).
create or replace function public.run_daily_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer := (select count(*) from public.notifications);
  v_soon integer := coalesce((select (value #>> '{}')::int from public.settings where key = 'contract_expiring_soon_days'), 30);
  v_stale integer := coalesce((select (value #>> '{}')::int from public.settings where key = 'lead_stale_after_days'), 7);
  r record;
begin
  -- Contract status housekeeping.
  update public.contracts set status = 'expiring_soon'
  where status = 'active' and end_date is not null and end_date - current_date between 0 and v_soon;

  update public.contracts set status = 'expired', renewal_status = coalesce(renewal_status, 'expired')
  where status in ('active', 'expiring_soon') and end_date < current_date;

  for r in select * from public.reminder_rules where active loop
    if r.kind in ('payment_due', 'payment_overdue') then
      perform public.notify_permission_holders('payments.record', r.kind,
        case when r.kind = 'payment_overdue' then 'Overdue ' || b.days_overdue || ' days: ' else 'Payment due ' || to_char(b.due_date, 'DD Mon') || ': ' end
          || cu.full_name,
        b.description || ' — ' || b.currency || ' ' || to_char(b.outstanding, 'FM999,999,999,990') || ' outstanding (' || b.schedule_ref || ')',
        'installment', b.id, r.kind || ':' || r.offset_days || ':' || b.id)
      from public.installment_balances b
      join public.customers cu on cu.id = b.customer_id
      where b.outstanding > 0 and b.status <> 'disputed'
        and b.due_date + r.offset_days <= current_date
        and b.due_date + r.offset_days > current_date - 7;

    elsif r.kind = 'contract_expiry' then
      insert into public.notifications (recipient_id, kind, title, body, entity_type, entity_id, dedupe_key)
      select c.responsible_id, 'contract_expiry',
             'Contract ' || c.ref || case when c.end_date <= current_date then ' expires today' else ' expires in ' || (c.end_date - current_date) || ' days' end,
             p.title || ' — ends ' || to_char(c.end_date, 'DD Mon YYYY'),
             'contract', c.id, 'contract_expiry:' || r.offset_days || ':' || c.id
      from public.contracts c join public.properties p on p.id = c.property_id
      where c.responsible_id is not null
        and c.status in ('active', 'expiring_soon')
        and c.end_date + r.offset_days <= current_date
        and c.end_date + r.offset_days > current_date - 7
      on conflict (dedupe_key) do nothing;

    elsif r.kind = 'follow_up' then
      insert into public.notifications (recipient_id, kind, title, body, entity_type, entity_id, dedupe_key)
      select a.assigned_to, 'follow_up', 'Follow-up due: ' || a.subject, a.notes, 'activity', a.id, 'follow_up:' || a.id
      from public.activities a
      where a.assigned_to is not null and a.completed_at is null and a.due_at::date <= current_date
      on conflict (dedupe_key) do nothing;

    elsif r.kind = 'stale_lead' then
      insert into public.notifications (recipient_id, kind, title, body, entity_type, entity_id, dedupe_key)
      select l.assigned_to, 'stale_lead', 'No activity for ' || v_stale || ' days: ' || l.name, l.ref, 'lead', l.id,
             'stale_lead:' || l.id || ':' || to_char(current_date, 'IYYY-IW')
      from public.leads l join public.lead_statuses ls on ls.id = l.status_id
      where l.assigned_to is not null and not ls.is_closed
        and coalesce(l.last_activity_at, l.created_at) < now() - make_interval(days => v_stale)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;

  return (select count(*) from public.notifications) - v_before;
end;
$$;
