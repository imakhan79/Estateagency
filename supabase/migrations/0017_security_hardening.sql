-- 0017: security hardening from the security review.
--   1. Functions: PostgreSQL grants EXECUTE to PUBLIC on every new function, so functions added after 0006
--      were callable by anonymous visitors. None leaked data (they are triggers or check permissions), but
--      access is now explicit: revoke everything, then grant only what each role needs.
--   2. Website forms: per-visitor (hashed IP) and site-wide rate limits on enquiries, and validation of
--      uploaded-photo paths, so scripted spam can't flood the CRM.

-- 1. Function access ---------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Visitors: the enquiry form, and helpers used by row level security.
grant execute on function public.submit_inquiry(text, text, text, text, text, text, text, date, jsonb) to anon, authenticated;
grant execute on function public.is_listing_public(uuid), public.has_permission(text), public.is_staff() to anon, authenticated;

-- Staff: functions the back office calls, and helpers used inside policies, triggers and generated columns.
grant execute on function
  public.my_permissions(), public.can_see_lead(uuid), public.settings_bool(text), public.normalize_mobile(text),
  public.convert_lead(uuid, uuid), public.renew_contract(uuid, date, date, numeric, numeric),
  public.add_installments(uuid, numeric, int, date, interval, text), public.create_rent_schedule(uuid),
  public.property_open_deals(uuid), public.record_payment(uuid, numeric, date, text, text, text, text, jsonb, uuid),
  public.transaction_completion_issues(uuid), public.find_possible_duplicates(text, text, text),
  public.dashboard_summary(date, date), public.calculate_commissions(uuid, uuid), public.pending_signups()
to authenticated;

-- 2. Enquiry rate limits -----------------------------------------------------
alter table public.leads add column submitted_ip_hash text;
create index leads_ip_hash_idx on public.leads (submitted_ip_hash, created_at) where submitted_ip_hash is not null;
create index leads_public_recent_idx on public.leads (created_at) where created_by is null;

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
  v_ip text;
  v_ip_hash text;
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

  -- Per-visitor and site-wide limits so scripted spam can't flood the CRM (security review, 0017).
  v_ip := coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip',
    split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1));
  if v_ip is not null then
    v_ip_hash := encode(extensions.digest(trim(v_ip) || ':enquiry', 'sha256'), 'hex');
    if (select count(*) from public.leads where submitted_ip_hash = v_ip_hash and created_at > now() - interval '15 minutes') >= 5 then
      raise exception 'Too many enquiries from your connection. Please call us or try again later.' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from public.leads where created_by is null and created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'We are receiving a lot of enquiries right now. Please try again in a few minutes or call us.' using errcode = '22023';
  end if;
  if p_details is not null and (
       jsonb_typeof(p_details) <> 'object'
       or (p_details ? 'photos' and (jsonb_typeof(p_details -> 'photos') <> 'array' or jsonb_array_length(p_details -> 'photos') > 6
           or exists (select 1 from jsonb_array_elements_text(p_details -> 'photos') ph where ph !~ '^sell/[0-9a-f-]{36}\.(jpe?g|png|webp)$')))
     ) then
    raise exception 'Invalid property details' using errcode = '22023';
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
                            type_id, preferred_contact, preferred_viewing_date, submission, submitted_ip_hash,
                            preferred_city, preferred_area, category_id, budget_max)
  values (
    p_name, p_mobile, p_email, p_inquiry_type, nullif(trim(coalesce(p_message, '')), ''), v_property,
    (select id from public.lead_sources where slug = v_source),
    (select id from public.lead_statuses where slug = 'new'),
    (select id from public.party_categories where slug = v_type),
    p_preferred_contact, p_preferred_viewing_date,
    case when p_inquiry_type = 'sell' then p_details end, v_ip_hash,
    nullif(p_details ->> 'city', ''), nullif(p_details ->> 'area', ''),
    (select id from public.property_categories where slug = p_details ->> 'category'),
    case when p_details ->> 'expected_price' ~ '^[0-9]+(\.[0-9]+)?$' then (p_details ->> 'expected_price')::numeric end
  )
  returning ref into v_ref;

  return v_ref;
end;
$$;

grant execute on function public.submit_inquiry(text, text, text, text, text, text, text, date, jsonb) to anon, authenticated;
