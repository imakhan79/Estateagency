-- 0005: reminders, report views, audit log and deletion guards (BRD §2 reminders and reporting, §5.5, §8.4)

-- Open deals on a property, so the UI can warn about conflicting transactions (BRD §5.6).
create or replace function public.property_open_deals(p_property uuid)
returns table (kind text, id uuid, ref text, status text)
language sql
stable
set search_path = ''
as $$
  select 'transaction', t.id, t.ref, s.name
  from public.transactions t join public.transaction_statuses s on s.id = t.status_id
  where t.property_id = p_property and not s.is_closed
  union all
  select 'contract', c.id, c.ref, cs.name
  from public.contracts c join public.contract_statuses cs on cs.slug = c.status
  where c.property_id = p_property
    and c.status in ('draft', 'under_review', 'pending_signature', 'active', 'expiring_soon', 'termination_in_progress');
$$;

-- A clear message instead of a foreign-key error when deleting a property in use (BRD §5.5).
create or replace function public.properties_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.transactions where property_id = old.id)
     or exists (select 1 from public.contracts where property_id = old.id)
     or exists (select 1 from public.payment_schedules where property_id = old.id) then
    raise exception 'This property has transactions, contracts or payments, so it cannot be deleted. Archive it instead.';
  end if;
  return old;
end;
$$;

create trigger properties_before_delete before delete on public.properties
  for each row execute function public.properties_before_delete();

-- ---------------------------------------------------------------------------
-- Balances and reports (views run with the caller's permissions)
-- ---------------------------------------------------------------------------

create view public.installment_balances with (security_invoker = true) as
select
  i.id, i.schedule_id, s.ref as schedule_ref, s.title as schedule_title, s.customer_id, s.property_id,
  s.contract_id, s.transaction_id, s.direction, s.currency,
  i.seq, i.description, i.due_date, i.amount,
  coalesce(p.paid, 0) as paid,
  case when i.waived_at is not null then 0 else greatest(i.amount - coalesce(p.paid, 0), 0) end as outstanding,
  p.last_paid_on,
  case
    when i.waived_at is not null then 'waived'
    when coalesce(p.paid, 0) >= i.amount then 'paid'
    when i.due_date < current_date then 'overdue'
    when coalesce(p.paid, 0) > 0 then 'partial'
    when i.due_date <= current_date + 7 then 'due_soon'
    else 'upcoming'
  end as status,
  case when i.waived_at is null and coalesce(p.paid, 0) < i.amount and i.due_date < current_date
       then current_date - i.due_date else 0 end as days_overdue
from public.installments i
join public.payment_schedules s on s.id = i.schedule_id
left join (
  select installment_id, sum(amount) as paid, max(paid_on) as last_paid_on
  from public.payments where voided_at is null group by installment_id
) p on p.installment_id = i.id;

create view public.schedule_balances with (security_invoker = true) as
select
  s.id, s.ref, s.title, s.customer_id, s.property_id, s.contract_id, s.transaction_id, s.direction, s.currency,
  sum(b.amount) as total,
  sum(b.paid) as paid,
  sum(b.outstanding) as outstanding,
  sum(b.outstanding) filter (where b.status = 'overdue') as overdue,
  min(b.due_date) filter (where b.outstanding > 0) as next_due_date,
  count(*) as installment_count
from public.payment_schedules s
join public.installment_balances b on b.schedule_id = s.id
group by s.id;

create view public.contract_renewals with (security_invoker = true) as
select
  c.id, c.ref, c.status, c.renewal_status, c.property_id, p.ref as property_ref, p.title as property_title,
  c.start_date, c.end_date, c.end_date - current_date as days_remaining, c.next_action_date, c.responsible_id,
  (select string_agg(cu.full_name, ', ') from public.contract_parties cp join public.customers cu on cu.id = cp.customer_id
   where cp.contract_id = c.id and cp.role = 'tenant') as tenants
from public.contracts c
join public.properties p on p.id = c.property_id
where c.status in ('active', 'expiring_soon', 'expired', 'termination_in_progress') and c.end_date is not null;

create view public.report_inventory with (security_invoker = true) as
select pc.name as category, p.listing_type, p.availability, p.publication, count(*) as properties,
       sum(p.price) as total_price
from public.properties p join public.property_categories pc on pc.id = p.category_id
group by pc.name, p.listing_type, p.availability, p.publication;

create view public.report_lead_pipeline with (security_invoker = true) as
select
  date_trunc('month', l.created_at)::date as month, ls.name as status, ls.sort as status_sort,
  src.name as source, l.assigned_to, s.full_name as agent, count(*) as leads
from public.leads l
join public.lead_statuses ls on ls.id = l.status_id
join public.lead_sources src on src.id = l.source_id
left join public.staff s on s.id = l.assigned_to
group by 1, 2, 3, 4, 5, 6;

create view public.report_collections with (security_invoker = true) as
select date_trunc('month', p.paid_on)::date as month, p.currency, p.method, s.direction,
       count(*) as payments, sum(p.amount) as amount
from public.payments p join public.payment_schedules s on s.id = p.schedule_id
where p.voided_at is null
group by 1, 2, 3, 4;

create view public.report_agent_activity with (security_invoker = true) as
select s.id as staff_id, s.full_name,
  (select count(*) from public.leads l where l.assigned_to = s.id) as leads_assigned,
  (select count(*) from public.leads l join public.lead_statuses ls on ls.id = l.status_id
   where l.assigned_to = s.id and not ls.is_closed) as leads_open,
  (select count(*) from public.leads l join public.lead_statuses ls on ls.id = l.status_id
   where l.assigned_to = s.id and ls.is_won) as leads_won,
  (select count(*) from public.activities a where a.assigned_to = s.id and a.created_at > now() - interval '30 days') as activities_30d,
  (select count(*) from public.activities a where a.assigned_to = s.id and a.completed_at is null and a.due_at < now()) as overdue_follow_ups
from public.staff s
where s.active;

-- ---------------------------------------------------------------------------
-- Reminders (BRD §2 Reminder Management, §8.4)
-- ---------------------------------------------------------------------------

create table public.reminder_rules (
  id           smallint generated always as identity primary key,
  kind         text not null check (kind in ('payment_due', 'payment_overdue', 'contract_expiry', 'follow_up', 'stale_lead')),
  offset_days  smallint not null,     -- negative = before the date, positive = after
  active       boolean not null default true,
  unique (kind, offset_days)
);

insert into public.reminder_rules (kind, offset_days) values
  ('payment_due', -7), ('payment_due', -1), ('payment_due', 0),
  ('payment_overdue', 1), ('payment_overdue', 7), ('payment_overdue', 30),
  ('contract_expiry', -90), ('contract_expiry', -60), ('contract_expiry', -30), ('contract_expiry', -7), ('contract_expiry', 0),
  ('follow_up', 0),
  ('stale_lead', 0);

-- Runs daily. Each reminder is created once (dedupe key), with a 7-day catch-up window if a run is missed.
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
      where b.outstanding > 0
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

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);
create index audit_log_record_idx on public.audit_log (table_name, record_id, changed_at desc);
create index audit_log_changed_at_idx on public.audit_log (changed_at desc);

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;
  insert into public.audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'staff_id', v_old ->> 'staff_id'),
          lower(tg_op), auth.uid(), v_old, v_new);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['properties', 'customers', 'leads', 'transactions', 'transaction_parties', 'contracts',
                           'contract_parties', 'contract_documents', 'payment_schedules', 'installments', 'payments',
                           'staff', 'staff_permissions', 'role_permissions', 'settings']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trigger()',
                   t || '_audit', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily schedule (08:00 Pakistan time = 03:00 UTC)
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('daily-reminders', '0 3 * * *', 'select public.run_daily_reminders()');
exception when others then
  raise notice 'pg_cron not available (%). Enable it in Supabase and schedule public.run_daily_reminders() daily.', sqlerrm;
end;
$$;
