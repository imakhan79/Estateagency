-- 0003: leads, activities, notifications, lead conversion and public form submission (BRD §4.6, §4.7, §6)

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.staff (id) on delete cascade,
  kind          text not null,              -- new_lead, payment_due, payment_overdue, contract_expiry, follow_up, approval
  title         text not null,
  body          text,
  entity_type   text,                       -- lead, installment, contract, activity, transaction
  entity_id     uuid,
  dedupe_key    text unique,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);

-- Sends a notification to every active staff member holding a permission.
create or replace function public.notify_permission_holders(
  p_permission text, p_kind text, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_dedupe text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, kind, title, body, entity_type, entity_id, dedupe_key)
  select s.id, p_kind, p_title, p_body, p_entity_type, p_entity_id,
         case when p_dedupe is null then null else p_dedupe || ':' || s.id end
  from public.staff s
  where s.active and (
    exists (select 1 from public.role_permissions rp where rp.role = s.role and rp.permission = p_permission)
    or exists (select 1 from public.staff_permissions sp where sp.staff_id = s.id and sp.permission = p_permission)
  )
  on conflict (dedupe_key) do nothing;
$$;

create table public.leads (
  id                      uuid primary key default gen_random_uuid(),
  ref                     text not null unique,
  name                    text not null check (char_length(name) between 1 and 120),
  mobile                  text not null check (char_length(mobile) between 7 and 30),
  mobile_normalized       text generated always as (public.normalize_mobile(mobile)) stored,
  email                   text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  type_id                 smallint references public.party_categories (id),
  inquiry_type            text not null default 'general'
                            check (inquiry_type in ('buy', 'rent', 'sell', 'general', 'viewing')),
  requirement             text check (char_length(requirement) <= 4000),
  preferred_city          text,
  preferred_area          text,
  category_id             smallint references public.property_categories (id),
  budget_min              numeric(14, 2) check (budget_min >= 0),
  budget_max              numeric(14, 2) check (budget_max >= 0),
  property_id             uuid references public.properties (id) on delete set null,
  source_id               smallint not null references public.lead_sources (id),
  status_id               smallint not null references public.lead_statuses (id),
  priority                text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assigned_to             uuid references public.staff (id) on delete set null,
  preferred_contact       text check (preferred_contact in ('phone', 'whatsapp', 'email')),
  preferred_viewing_date  date,
  next_follow_up_at       timestamptz,
  notes                   text,
  submission              jsonb,               -- extra Sell Your Property details (location, size, expected price, photos)
  duplicate_of            uuid references public.leads (id) on delete set null,
  customer_id             uuid references public.customers (id) on delete set null,
  converted_at            timestamptz,
  last_activity_at        timestamptz,
  created_by              uuid references public.staff (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max)
);
create sequence public.lead_ref_seq;
alter table public.leads alter column ref set default 'LD-' || lpad(nextval('public.lead_ref_seq')::text, 6, '0');
create index leads_mobile_idx on public.leads (mobile_normalized, created_at desc);
create index leads_assigned_idx on public.leads (assigned_to, status_id);
create index leads_status_idx on public.leads (status_id);
create index leads_property_idx on public.leads (property_id);
create index leads_customer_idx on public.leads (customer_id);
create index leads_source_idx on public.leads (source_id);
create index leads_duplicate_idx on public.leads (duplicate_of);
create index leads_unassigned_idx on public.leads (created_at) where assigned_to is null;

create or replace function public.leads_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Flag repeat enquiries from the same mobile number (BRD §4.6 rule 6).
    select l.id into new.duplicate_of
    from public.leads l
    where l.mobile_normalized = public.normalize_mobile(new.mobile)
    order by l.created_at desc
    limit 1;

    if auth.uid() is not null then
      new.created_by := auth.uid();
      -- Agents creating their own leads own them by default.
      if new.assigned_to is null and not public.has_permission('leads.assign') then
        new.assigned_to := auth.uid();
      end if;
    end if;
  else
    new.updated_at := now();
  end if;

  if auth.uid() is not null
     and new.assigned_to is distinct from (case when tg_op = 'UPDATE' then old.assigned_to end)
     and new.assigned_to is distinct from auth.uid()
     and not public.has_permission('leads.assign') then
    raise exception 'You do not have permission to assign leads to other staff';
  end if;
  return new;
end;
$$;

create trigger leads_before_write before insert or update on public.leads
  for each row execute function public.leads_before_write();

create or replace function public.leads_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.assigned_to is null then
    perform public.notify_permission_holders(
      'leads.assign', 'new_lead',
      'New ' || case new.inquiry_type when 'viewing' then 'viewing request' when 'sell' then 'property submission' else 'enquiry' end
        || ' from ' || new.name,
      coalesce(left(new.requirement, 200), ''), 'lead', new.id, 'new_lead:' || new.id);
  end if;

  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and new.assigned_to is distinct from auth.uid() then
    insert into public.notifications (recipient_id, kind, title, body, entity_type, entity_id)
    values (new.assigned_to, 'lead_assigned', 'Lead ' || new.ref || ' assigned to you', new.name, 'lead', new.id);
  end if;
  return null;
end;
$$;

create trigger leads_after_write after insert or update of assigned_to on public.leads
  for each row execute function public.leads_after_write();

-- Calls, emails, meetings, visits, negotiations, tasks and notes (BRD §6.5).
-- An activity with due_at and no completed_at is a scheduled follow-up.
create table public.activities (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('call', 'email', 'whatsapp', 'meeting', 'visit', 'negotiation', 'task', 'note')),
  lead_id        uuid references public.leads (id) on delete cascade,
  customer_id    uuid references public.customers (id) on delete cascade,
  property_id    uuid references public.properties (id) on delete set null,
  subject        text not null check (char_length(subject) between 1 and 200),
  notes          text,
  outcome        text,
  due_at         timestamptz,
  completed_at   timestamptz,
  assigned_to    uuid references public.staff (id) on delete set null,
  created_by     uuid references public.staff (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (lead_id is not null or customer_id is not null)
);
create index activities_lead_idx on public.activities (lead_id, created_at desc);
create index activities_customer_idx on public.activities (customer_id, created_at desc);
create index activities_property_idx on public.activities (property_id);
create index activities_open_idx on public.activities (assigned_to, due_at) where completed_at is null and due_at is not null;

create or replace function public.activities_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
    new.assigned_to := coalesce(new.assigned_to, auth.uid());
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger activities_before_write before insert or update on public.activities
  for each row execute function public.activities_before_write();

create or replace function public.activities_touch_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is not null then
    update public.leads set last_activity_at = now() where id = new.lead_id;
  end if;
  return null;
end;
$$;

create trigger activities_touch_lead after insert on public.activities
  for each row execute function public.activities_touch_lead();

-- Converts a lead to a customer, reusing an existing customer with the same mobile (BRD §6.6).
-- Runs with the caller's permissions, so RLS decides whether they may do it.
create or replace function public.convert_lead(p_lead uuid, p_customer uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_customer uuid := p_customer;
begin
  select * into v_lead from public.leads where id = p_lead;
  if not found then raise exception 'Lead not found'; end if;

  if v_customer is null then
    select c.id into v_customer from public.customers c
    where c.mobile_normalized = v_lead.mobile_normalized
    order by c.created_at limit 1;
  end if;

  if v_customer is null then
    insert into public.customers (full_name, mobile, email)
    values (v_lead.name, v_lead.mobile, v_lead.email)
    returning id into v_customer;
  end if;

  if v_lead.type_id is not null then
    insert into public.customer_categories (customer_id, category_id)
    values (v_customer, v_lead.type_id) on conflict do nothing;
  end if;

  update public.leads set customer_id = v_customer, converted_at = coalesce(converted_at, now()) where id = p_lead;
  update public.activities set customer_id = v_customer where lead_id = p_lead and customer_id is null;
  return v_customer;
end;
$$;

-- Public website form handler (BRD §4.6, §4.7). The only way visitors can write data.
create or replace function public.submit_inquiry(
  p_name text,
  p_mobile text,
  p_inquiry_type text,
  p_email text default null,
  p_message text default null,
  p_property_ref text default null,
  p_preferred_contact text default null,
  p_preferred_viewing_date date default null,
  p_details jsonb default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mobile text := public.normalize_mobile(p_mobile);
  v_property uuid;
  v_source text;
  v_type text;
  v_ref text;
begin
  p_name := trim(coalesce(p_name, ''));
  p_email := nullif(trim(coalesce(p_email, '')), '');

  if char_length(p_name) < 2 or char_length(p_name) > 120 then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  if v_mobile is null or v_mobile !~ '^\+?[0-9]{10,15}$' then
    raise exception 'Please enter a valid mobile number' using errcode = '22023';
  end if;
  if p_email is not null and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address' using errcode = '22023';
  end if;
  if p_inquiry_type not in ('buy', 'rent', 'sell', 'general', 'viewing') then
    raise exception 'Unknown enquiry type' using errcode = '22023';
  end if;
  if char_length(coalesce(p_message, '')) > 4000 or pg_column_size(p_details) > 20000 then
    raise exception 'Your message is too long' using errcode = '22023';
  end if;
  if p_preferred_contact is not null and p_preferred_contact not in ('phone', 'whatsapp', 'email') then
    p_preferred_contact := null;
  end if;

  -- Simple flood protection: one submission per number per minute.
  if exists (select 1 from public.leads where mobile_normalized = v_mobile and created_at > now() - interval '1 minute') then
    raise exception 'We have just received your enquiry. Please wait a minute before sending another.' using errcode = '22023';
  end if;

  if p_property_ref is not null then
    select p.id into v_property from public.properties p where p.ref = p_property_ref;
    if v_property is not null and not public.is_listing_public(v_property) then
      v_property := null;
    end if;
  end if;

  v_source := case p_inquiry_type when 'viewing' then 'website-viewing' when 'sell' then 'sell-your-property' else 'website-inquiry' end;
  v_type := case p_inquiry_type when 'buy' then 'buyer' when 'rent' then 'tenant' when 'sell' then 'seller'
                                when 'viewing' then (select case when listing_type = 'rent' then 'tenant' else 'buyer' end
                                                     from public.properties where id = v_property)
            end;

  insert into public.leads (name, mobile, email, inquiry_type, requirement, property_id, source_id, status_id,
                            type_id, preferred_contact, preferred_viewing_date, submission,
                            preferred_city, preferred_area, category_id, budget_max)
  values (
    p_name, p_mobile, p_email, p_inquiry_type, nullif(trim(coalesce(p_message, '')), ''), v_property,
    (select id from public.lead_sources where slug = v_source),
    (select id from public.lead_statuses where slug = 'new'),
    (select id from public.party_categories where slug = v_type),
    p_preferred_contact, p_preferred_viewing_date,
    case when p_inquiry_type = 'sell' then p_details end,
    nullif(p_details ->> 'city', ''), nullif(p_details ->> 'area', ''),
    (select id from public.property_categories where slug = p_details ->> 'category'),
    case when p_details ->> 'expected_price' ~ '^[0-9]+(\.[0-9]+)?$' then (p_details ->> 'expected_price')::numeric end
  )
  returning ref into v_ref;

  return v_ref;
end;
$$;
