-- 0008: reminder framework per BRD §11 (recipients, channels, logs, viewing and escalation reminders)
-- and the management dashboard figures for BRD §12.1.

-- Fix: visitors need is_staff() because the settings read policy calls it.
grant execute on function public.is_staff() to anon;

insert into public.permissions (slug, description) values
  ('reminders.escalations', 'Receives management escalations for long-overdue payments and stale leads');
insert into public.role_permissions (role, permission) values
  ('super_admin', 'reminders.escalations'), ('management', 'reminders.escalations');

-- ---------------------------------------------------------------------------
-- Rules: who gets each reminder and on which channels (BRD §11.2, §11.5)
-- ---------------------------------------------------------------------------

alter table public.reminder_rules drop constraint reminder_rules_kind_check;
alter table public.reminder_rules
  add constraint reminder_rules_kind_check check (kind in (
    'payment_upcoming', 'payment_due', 'payment_overdue', 'contract_expiry', 'contract_renewal',
    'follow_up', 'viewing', 'escalation', 'stale_lead')),
  add column notify_staff text not null default 'responsible'
    check (notify_staff in ('responsible', 'finance', 'managers', 'none')),
  add column notify_customer boolean not null default false,
  add column channels text[] not null default '{in_app}'
    check (channels <@ array['in_app', 'email', 'sms', 'whatsapp']);

-- BRD §11.3 defaults: 7 and 3 days before, on the day, 3 and 7 days after; escalate after 30.
delete from public.reminder_rules;
insert into public.reminder_rules (kind, offset_days, notify_staff, notify_customer) values
  ('payment_upcoming', -7, 'finance', true),
  ('payment_upcoming', -3, 'finance', true),
  ('payment_due',       0, 'finance', true),
  ('payment_overdue',   3, 'finance', true),
  ('payment_overdue',   7, 'finance', true),
  ('escalation',       30, 'managers', false),
  ('contract_expiry', -90, 'responsible', false),
  ('contract_expiry', -60, 'responsible', false),
  ('contract_expiry', -30, 'responsible', false),
  ('contract_expiry',  -7, 'responsible', false),
  ('contract_expiry',   0, 'responsible', false),
  ('contract_renewal',  0, 'responsible', false),   -- on the contract's next_action_date
  ('follow_up',         0, 'responsible', false),
  ('viewing',          -1, 'responsible', false),   -- the day before a scheduled visit
  ('stale_lead',        0, 'responsible', false);

-- ---------------------------------------------------------------------------
-- Reminder log (BRD §11.6). In-app reminders are delivered immediately; email, SMS and
-- WhatsApp rows stay 'scheduled' until a sender (edge function / provider) picks them up.
-- ---------------------------------------------------------------------------

create table public.reminder_log (
  id                     uuid primary key default gen_random_uuid(),
  rule_id                smallint references public.reminder_rules (id) on delete set null,
  category               text not null,
  entity_type            text not null,
  entity_id              uuid not null,
  property_id            uuid references public.properties (id) on delete set null,
  customer_id            uuid references public.customers (id) on delete set null,
  recipient_staff_id     uuid references public.staff (id) on delete cascade,
  recipient_customer_id  uuid references public.customers (id) on delete cascade,
  channel                text not null check (channel in ('in_app', 'email', 'sms', 'whatsapp')),
  status                 text not null default 'scheduled'
                           check (status in ('scheduled', 'attempted', 'sent', 'delivered', 'failed', 'skipped')),
  title                  text not null,
  body                   text,
  scheduled_for          timestamptz not null default now(),
  attempted_at           timestamptz,
  sent_at                timestamptz,
  delivered_at           timestamptz,
  error                  text,
  provider_message_id    text,
  notification_id        uuid references public.notifications (id) on delete set null,
  dedupe_key             text not null unique,
  created_at             timestamptz not null default now(),
  check (recipient_staff_id is not null or recipient_customer_id is not null)
);
create index reminder_log_queue_idx on public.reminder_log (channel, scheduled_for) where status = 'scheduled';
create index reminder_log_entity_idx on public.reminder_log (entity_type, entity_id);
create index reminder_log_customer_idx on public.reminder_log (customer_id);
create index reminder_log_property_idx on public.reminder_log (property_id);
create index reminder_log_staff_idx on public.reminder_log (recipient_staff_id);
create index reminder_log_recipient_customer_idx on public.reminder_log (recipient_customer_id);
create index reminder_log_rule_idx on public.reminder_log (rule_id);
create index reminder_log_notification_idx on public.reminder_log (notification_id);

alter table public.reminder_log enable row level security;
grant select on public.reminder_log to authenticated;
create policy "Reminder log for administrators and own reminders" on public.reminder_log for select to authenticated
  using (recipient_staff_id = (select auth.uid()) or (select public.has_permission('settings.manage'))
         or (select public.has_permission('reports.view')));

-- Queues one reminder for every recipient and channel the rule names.
create or replace function public.queue_reminder(
  p_rule public.reminder_rules, p_entity_type text, p_entity_id uuid, p_title text, p_body text,
  p_responsible uuid, p_customer uuid, p_property uuid, p_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid;
  v_channel text;
  v_log uuid;
  v_notification uuid;
begin
  for v_staff in
    select s.id from public.staff s
    where s.active and (
      (p_rule.notify_staff = 'responsible' and s.id = p_responsible)
      or (p_rule.notify_staff = 'finance' and (
            exists (select 1 from public.role_permissions rp where rp.role = s.role and rp.permission = 'payments.record')
            or exists (select 1 from public.staff_permissions sp where sp.staff_id = s.id and sp.permission = 'payments.record')))
      or (p_rule.notify_staff = 'managers' and (
            exists (select 1 from public.role_permissions rp where rp.role = s.role and rp.permission = 'reminders.escalations')
            or exists (select 1 from public.staff_permissions sp where sp.staff_id = s.id and sp.permission = 'reminders.escalations')))
    )
  loop
    foreach v_channel in array p_rule.channels loop
      insert into public.reminder_log (rule_id, category, entity_type, entity_id, property_id, customer_id,
                                       recipient_staff_id, channel, title, body, dedupe_key)
      values (p_rule.id, p_rule.kind, p_entity_type, p_entity_id, p_property, p_customer, v_staff, v_channel,
              p_title, p_body, p_key || ':staff:' || v_staff || ':' || v_channel)
      on conflict (dedupe_key) do nothing
      returning id into v_log;

      if v_log is not null and v_channel = 'in_app' then
        insert into public.notifications (recipient_id, kind, title, body, entity_type, entity_id)
        values (v_staff, p_rule.kind, p_title, p_body, p_entity_type, p_entity_id)
        returning id into v_notification;
        update public.reminder_log
        set status = 'delivered', attempted_at = now(), sent_at = now(), delivered_at = now(), notification_id = v_notification
        where id = v_log;
      end if;
    end loop;
  end loop;

  -- Customers can only be reached outside the system (email / SMS / WhatsApp).
  if p_rule.notify_customer and p_customer is not null then
    foreach v_channel in array p_rule.channels loop
      continue when v_channel = 'in_app';
      insert into public.reminder_log (rule_id, category, entity_type, entity_id, property_id, customer_id,
                                       recipient_customer_id, channel, title, body, dedupe_key)
      values (p_rule.id, p_rule.kind, p_entity_type, p_entity_id, p_property, p_customer, p_customer, v_channel,
              p_title, p_body, p_key || ':customer:' || v_channel)
      on conflict (dedupe_key) do nothing;
    end loop;
  end if;
end;
$$;

-- Daily job. A 7-day catch-up window covers missed runs; dedupe keys stop repeats.
-- Fully paid installments have nothing outstanding, so they never get reminders (BRD §11.3);
-- partially paid ones show the remaining amount.
create or replace function public.run_daily_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer := (select count(*) from public.reminder_log);
  v_soon integer := coalesce((select (value #>> '{}')::int from public.settings where key = 'contract_expiring_soon_days'), 30);
  v_stale integer := coalesce((select (value #>> '{}')::int from public.settings where key = 'lead_stale_after_days'), 7);
  r public.reminder_rules;
  x record;
begin
  update public.contracts set status = 'expiring_soon'
  where status = 'active' and end_date is not null and end_date - current_date between 0 and v_soon;

  update public.contracts set status = 'expired', renewal_status = coalesce(renewal_status, 'expired')
  where status in ('active', 'expiring_soon') and end_date < current_date;

  for r in select * from public.reminder_rules where active order by id loop
    if r.kind in ('payment_upcoming', 'payment_due', 'payment_overdue', 'escalation') then
      for x in
        select b.*, cu.full_name, coalesce(c.responsible_id, t.agent_id) as responsible
        from public.installment_balances b
        join public.customers cu on cu.id = b.customer_id
        left join public.contracts c on c.id = b.contract_id
        left join public.transactions t on t.id = b.transaction_id
        where b.outstanding > 0 and b.status <> 'disputed' and b.direction = 'incoming'
          and b.due_date + r.offset_days <= current_date
          and b.due_date + r.offset_days > current_date - 7
      loop
        perform public.queue_reminder(r, 'installment', x.id,
          case r.kind
            when 'payment_upcoming' then 'Payment due in ' || (x.due_date - current_date) || ' days: ' || x.full_name
            when 'payment_due' then 'Payment due today: ' || x.full_name
            when 'payment_overdue' then 'Payment overdue ' || x.days_overdue || ' days: ' || x.full_name
            else 'Escalation: ' || x.full_name || ' is ' || x.days_overdue || ' days overdue'
          end,
          x.description || ' — ' || x.currency || ' ' || to_char(x.outstanding, 'FM999,999,999,990')
            || case when x.paid > 0 then ' remaining of ' || to_char(x.amount, 'FM999,999,999,990') else ' due' end
            || ' on ' || to_char(x.due_date, 'DD Mon YYYY') || ' (' || x.schedule_ref || ')',
          x.responsible, x.customer_id, x.property_id, r.kind || ':' || r.offset_days || ':' || x.id);
      end loop;

    elsif r.kind = 'contract_expiry' then
      for x in
        select c.*, p.title as property_title,
               (select cp.customer_id from public.contract_parties cp where cp.contract_id = c.id and cp.role = 'tenant' limit 1) as tenant
        from public.contracts c join public.properties p on p.id = c.property_id
        where c.status in ('active', 'expiring_soon') and c.end_date is not null
          and c.end_date + r.offset_days <= current_date and c.end_date + r.offset_days > current_date - 7
      loop
        perform public.queue_reminder(r, 'contract', x.id,
          'Contract ' || x.ref || case when x.end_date <= current_date then ' expires today' else ' expires in ' || (x.end_date - current_date) || ' days' end,
          x.property_title || ' — ends ' || to_char(x.end_date, 'DD Mon YYYY') || '. Renewal status: ' || coalesce(x.renewal_status, 'not_contacted'),
          x.responsible_id, x.tenant, x.property_id, r.kind || ':' || r.offset_days || ':' || x.id);
      end loop;

    elsif r.kind = 'contract_renewal' then
      for x in
        select c.*, p.title as property_title from public.contracts c join public.properties p on p.id = c.property_id
        where c.status in ('active', 'expiring_soon', 'expired') and c.next_action_date is not null
          and c.next_action_date + r.offset_days <= current_date and c.next_action_date + r.offset_days > current_date - 7
      loop
        perform public.queue_reminder(r, 'contract', x.id, 'Renewal action due: ' || x.ref, x.property_title,
          x.responsible_id, null, x.property_id, 'contract_renewal:' || x.id || ':' || x.next_action_date);
      end loop;

    elsif r.kind in ('follow_up', 'viewing') then
      for x in
        select a.*, coalesce(l.name, cu.full_name) as who
        from public.activities a
        left join public.leads l on l.id = a.lead_id
        left join public.customers cu on cu.id = a.customer_id
        where a.completed_at is null and a.due_at is not null
          and ((r.kind = 'viewing' and a.kind = 'visit') or (r.kind = 'follow_up' and a.kind <> 'visit'))
          and a.due_at::date + r.offset_days <= current_date and a.due_at::date + r.offset_days > current_date - 7
      loop
        perform public.queue_reminder(r, 'activity', x.id,
          case when r.kind = 'viewing' then 'Viewing ' || to_char(x.due_at at time zone 'Asia/Karachi', 'DD Mon, HH12:MI AM') || ': ' || x.who
               else 'Follow-up due: ' || x.subject end,
          x.notes, x.assigned_to, x.customer_id, x.property_id, r.kind || ':' || r.offset_days || ':' || x.id);
      end loop;

    elsif r.kind = 'stale_lead' then
      for x in
        select l.* from public.leads l join public.lead_statuses ls on ls.id = l.status_id
        where l.assigned_to is not null and not ls.is_closed
          and coalesce(l.last_activity_at, l.created_at) < now() - make_interval(days => v_stale)
      loop
        perform public.queue_reminder(r, 'lead', x.id, 'No activity for ' || v_stale || '+ days: ' || x.name, x.ref,
          x.assigned_to, null, x.property_id, 'stale_lead:' || x.id || ':' || to_char(current_date, 'IYYY-IW'));
      end loop;
    end if;
  end loop;

  return (select count(*) from public.reminder_log) - v_before;
end;
$$;

revoke execute on function public.queue_reminder(public.reminder_rules, text, uuid, text, text, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.run_daily_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Management dashboard (BRD §12.1). Figures respect the caller's permissions via RLS.
-- ---------------------------------------------------------------------------

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
            where p.voided_at is null and p.paid_on between b.d_from and b.d_to), 0),
        'outstanding', coalesce(sum(outstanding) filter (where direction = 'incoming'), 0),
        'overdue', coalesce(sum(outstanding) filter (where direction = 'incoming' and status = 'overdue'), 0),
        'upcoming_30_days', coalesce(sum(outstanding) filter (where direction = 'incoming'
            and status in ('due', 'upcoming', 'partially_paid') and due_date <= current_date + 30), 0))
      from public.installment_balances)
  );
$$;

grant execute on function public.dashboard_summary(date, date) to authenticated;
