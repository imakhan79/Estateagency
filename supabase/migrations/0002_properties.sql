-- 0002: property inventory, media, change history and publication rules (BRD §4.3, §5)

create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  ref                text not null unique,
  full_name          text not null check (char_length(full_name) between 1 and 150),
  mobile             text,
  mobile_normalized  text generated always as (public.normalize_mobile(mobile)) stored,
  email              text,
  cnic               text,                       -- national ID, used on contracts
  address            text,
  notes              text,
  portal_user_id     uuid unique references auth.users (id) on delete set null,  -- reserved for the later customer portal
  created_by         uuid references public.staff (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create sequence public.customer_ref_seq;
alter table public.customers alter column ref set default 'CU-' || lpad(nextval('public.customer_ref_seq')::text, 6, '0');
create index customers_mobile_idx on public.customers (mobile_normalized);
create index customers_email_idx on public.customers (lower(email));
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

create table public.customer_categories (
  customer_id  uuid not null references public.customers (id) on delete cascade,
  category_id  smallint not null references public.party_categories (id) on delete restrict,
  primary key (customer_id, category_id)
);
create index customer_categories_category_idx on public.customer_categories (category_id);

create table public.properties (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title            text not null check (char_length(title) between 3 and 160),
  description      text not null default '',
  category_id      smallint not null references public.property_categories (id),
  type_id          smallint not null references public.property_types (id),
  listing_type     text not null check (listing_type in ('sale', 'rent')),
  price            numeric(14, 2) check (price >= 0),
  currency         text not null default 'PKR' references public.currencies (code),
  country          text not null default 'Pakistan',
  city             text not null,
  area             text not null,                      -- locality / society / sector
  address          text,                               -- full address, staff only
  public_address   text,                               -- what the website may show
  size             numeric(12, 2) check (size > 0),
  size_unit        text not null default 'marla' references public.area_units (code),
  bedrooms         smallint check (bedrooms between 0 and 50),
  bathrooms        smallint check (bathrooms between 0 and 50),
  floors           smallint check (floors between 0 and 200),
  furnishing       text check (furnishing in ('furnished', 'semi_furnished', 'unfurnished')),
  featured         boolean not null default false,
  availability     text not null default 'available' references public.availability_statuses (slug),
  publication      text not null default 'draft'
                     check (publication in ('draft', 'under_review', 'approved', 'published', 'unpublished', 'archived')),
  video_urls       text[] not null default '{}',
  ownership        text not null default 'third_party' check (ownership in ('client_owned', 'third_party')),
  owner_id         uuid references public.customers (id) on delete set null,
  acquired_on      date,                               -- for client-owned stock (BRD §7.5 enhancement)
  agent_id         uuid references public.staff (id) on delete set null,
  internal_notes   text,
  seo_title        text,
  seo_description  text,
  created_by       uuid references public.staff (id) on delete set null,
  updated_by       uuid references public.staff (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  published_at     timestamptz,
  archived_at      timestamptz
);
create sequence public.property_ref_seq;
alter table public.properties alter column ref set default 'PR-' || lpad(nextval('public.property_ref_seq')::text, 6, '0');

create index properties_public_idx on public.properties (listing_type, city, price) where publication = 'published';
create index properties_type_idx on public.properties (type_id);
create index properties_category_idx on public.properties (category_id);
create index properties_agent_idx on public.properties (agent_id);
create index properties_owner_idx on public.properties (owner_id);
create index properties_availability_idx on public.properties (availability);

create table public.property_features (
  property_id  uuid not null references public.properties (id) on delete cascade,
  feature_id   smallint not null references public.features (id) on delete restrict,
  primary key (property_id, feature_id)
);
create index property_features_feature_idx on public.property_features (feature_id);

-- Images and videos (public bucket or external URL) and documents (private bucket).
create table public.property_media (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  kind          text not null check (kind in ('image', 'video', 'document')),
  storage_path  text,
  external_url  text,
  file_name     text,
  alt           text,
  sort          smallint not null default 0,
  is_public     boolean not null default true,
  uploaded_by   uuid references public.staff (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (storage_path is not null or external_url is not null),
  check (kind <> 'document' or not is_public or storage_path is not null)
);
create index property_media_property_idx on public.property_media (property_id, kind, sort);

-- Price, availability and publication history (BRD §5.2 enhancement).
create table public.property_history (
  id           bigint generated always as identity primary key,
  property_id  uuid not null references public.properties (id) on delete cascade,
  field        text not null,
  old_value    text,
  new_value    text,
  changed_by   uuid references public.staff (id) on delete set null,
  changed_at   timestamptz not null default now()
);
create index property_history_property_idx on public.property_history (property_id, changed_at desc);

-- Is this property visible to website visitors? Used by RLS on child tables.
create or replace function public.is_listing_public(p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    join public.availability_statuses a on a.slug = p.availability
    where p.id = p_property and p.publication = 'published' and a.show_on_site
  );
$$;

-- Permission checks and the "complete before publishing" rule (BRD §5.3).
create or replace function public.properties_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_has_rooms boolean;
  v_pub_changed boolean := tg_op = 'INSERT' or old.publication is distinct from new.publication;
begin
  if not exists (select 1 from public.property_types t where t.id = new.type_id and t.category_id = new.category_id) then
    raise exception 'Property type does not belong to the selected category';
  end if;

  if auth.uid() is not null then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    end if;
    if v_pub_changed and new.publication in ('approved', 'published', 'unpublished')
       and not public.has_permission('properties.publish') then
      raise exception 'You do not have permission to publish or unpublish listings';
    end if;
    if v_pub_changed and new.publication = 'archived' and not public.has_permission('properties.archive') then
      raise exception 'You do not have permission to archive properties';
    end if;
  end if;

  if v_pub_changed and new.publication = 'published' then
    select t.has_rooms into v_has_rooms from public.property_types t where t.id = new.type_id;
    if coalesce(new.price, 0) <= 0 then raise exception 'Add a price before publishing'; end if;
    if new.size is null then raise exception 'Add the property size before publishing'; end if;
    if char_length(trim(new.description)) < 40 then raise exception 'Add a description (at least 40 characters) before publishing'; end if;
    if v_has_rooms and (new.bedrooms is null or new.bathrooms is null) then
      raise exception 'Add bedrooms and bathrooms before publishing';
    end if;
    if tg_op = 'INSERT' or not exists (
      select 1 from public.property_media m where m.property_id = new.id and m.kind = 'image' and m.is_public
    ) then
      raise exception 'Add at least one public photo before publishing';
    end if;
    if public.settings_bool('publication_requires_approval') and tg_op = 'UPDATE'
       and old.publication not in ('approved', 'unpublished') then
      raise exception 'This listing must be approved before it is published';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;

  if v_pub_changed and new.publication = 'archived' then
    new.archived_at := now();
  elsif v_pub_changed then
    new.archived_at := null;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.settings_bool(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::boolean from public.settings where key = p_key), false);
$$;

create trigger properties_before_write before insert or update on public.properties
  for each row execute function public.properties_before_write();

create or replace function public.properties_log_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.property_history (property_id, field, old_value, new_value, changed_by)
  select new.id, f.field, f.old_value, f.new_value, auth.uid()
  from (values
    ('price',        old.price::text || ' ' || old.currency, new.price::text || ' ' || new.currency),
    ('availability', old.availability, new.availability),
    ('publication',  old.publication, new.publication),
    ('listing_type', old.listing_type, new.listing_type)
  ) as f(field, old_value, new_value)
  where f.old_value is distinct from f.new_value;
  return null;
end;
$$;

create trigger properties_log_history after update on public.properties
  for each row execute function public.properties_log_history();
