-- 0001: configurable reference lists, settings, staff, roles and permissions (BRD §3, §4.2, §6.3, §7.3, §9.3)

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normalises Pakistani mobile numbers so duplicates can be matched:
-- "+92 300-1234567", "923001234567", "3001234567" and "03001234567" all become "03001234567".
create or replace function public.normalize_mobile(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d is null or d = '' then null
    when d like '0092%' then '0' || substr(d, 5)
    when d like '92%' and length(d) = 12 then '0' || substr(d, 3)
    when d like '3%' and length(d) = 10 then '0' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s;
$$;

-- ---------------------------------------------------------------------------
-- Reference lists (all maintainable by administrators)
-- ---------------------------------------------------------------------------

create table public.currencies (
  code        text primary key check (code ~ '^[A-Z]{3}$'),
  name        text not null,
  symbol      text not null,
  is_default  boolean not null default false,
  active      boolean not null default true
);
create unique index currencies_one_default on public.currencies (is_default) where is_default;

create table public.area_units (
  code         text primary key,
  name         text not null,
  sqft_factor  numeric(12, 4) not null check (sqft_factor > 0),  -- 1 unit = n square feet
  sort         smallint not null default 0,
  active       boolean not null default true
);

create table public.property_categories (
  id      smallint generated always as identity primary key,
  slug    text not null unique,
  name    text not null,
  sort    smallint not null default 0,
  active  boolean not null default true
);

create table public.property_types (
  id           smallint generated always as identity primary key,
  category_id  smallint not null references public.property_categories (id) on delete restrict,
  slug         text not null unique,
  name         text not null,
  has_rooms    boolean not null default true,   -- bedrooms/bathrooms apply (BRD §4.3 conditional fields)
  sort         smallint not null default 0,
  active       boolean not null default true
);
create index property_types_category_idx on public.property_types (category_id);

create table public.features (
  id      smallint generated always as identity primary key,
  slug    text not null unique,
  name    text not null,
  sort    smallint not null default 0,
  active  boolean not null default true
);

-- Business status of a property, separate from website publication (BRD §5.6).
create table public.availability_statuses (
  slug          text primary key,
  name          text not null,
  show_on_site  boolean not null default true,   -- false = drops out of active public listings
  sort          smallint not null default 0
);

create table public.lead_sources (
  id      smallint generated always as identity primary key,
  slug    text not null unique,
  name    text not null,
  active  boolean not null default true
);

-- Buyer, seller, tenant, landlord, investor... used for both lead type and customer category.
create table public.party_categories (
  id      smallint generated always as identity primary key,
  slug    text not null unique,
  name    text not null,
  active  boolean not null default true
);

create table public.lead_statuses (
  id         smallint generated always as identity primary key,
  slug       text not null unique,
  name       text not null,
  sort       smallint not null default 0,
  is_closed  boolean not null default false,   -- won/lost: excluded from "no recent activity" checks
  is_won     boolean not null default false,
  active     boolean not null default true
);

create table public.transaction_statuses (
  id         smallint generated always as identity primary key,
  slug       text not null unique,
  name       text not null,
  sort       smallint not null default 0,
  is_closed  boolean not null default false,
  active     boolean not null default true
);

create table public.contract_types (
  id      smallint generated always as identity primary key,
  slug    text not null unique,
  name    text not null,
  active  boolean not null default true
);

create table public.contract_statuses (
  slug         text primary key,
  name         text not null,
  sort         smallint not null default 0,
  is_terminal  boolean not null default false
);

create table public.contract_status_transitions (
  from_status  text not null references public.contract_statuses (slug) on delete cascade,
  to_status    text not null references public.contract_statuses (slug) on delete cascade,
  primary key (from_status, to_status)
);

-- Key/value site and system settings. is_public rows are readable by website visitors.
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now()
);
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Staff, roles and permissions (BRD §3)
-- ---------------------------------------------------------------------------

create table public.roles (
  slug         text primary key,
  name         text not null,
  description  text
);

create table public.permissions (
  slug         text primary key,
  description  text not null
);

create table public.role_permissions (
  role        text not null references public.roles (slug) on delete cascade,
  permission  text not null references public.permissions (slug) on delete cascade,
  primary key (role, permission)
);

-- Staff accounts are Supabase Auth users with a row here. Website visitors never get one.
create table public.staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null,
  phone       text,
  role        text not null references public.roles (slug),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

-- Individual grants on top of a role, e.g. one manager allowed to void payments (BRD §3.2 restriction).
create table public.staff_permissions (
  staff_id    uuid not null references public.staff (id) on delete cascade,
  permission  text not null references public.permissions (slug) on delete cascade,
  granted_by  uuid references public.staff (id),
  granted_at  timestamptz not null default now(),
  primary key (staff_id, permission)
);

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    where s.id = (select auth.uid())
      and s.active
      and (
        exists (select 1 from public.role_permissions rp where rp.role = s.role and rp.permission = p_permission)
        or exists (select 1 from public.staff_permissions sp where sp.staff_id = s.id and sp.permission = p_permission)
      )
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.id = (select auth.uid()) and s.active);
$$;

create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select rp.permission
  from public.staff s join public.role_permissions rp on rp.role = s.role
  where s.id = (select auth.uid()) and s.active
  union
  select sp.permission
  from public.staff s join public.staff_permissions sp on sp.staff_id = s.id
  where s.id = (select auth.uid()) and s.active;
$$;

-- ---------------------------------------------------------------------------
-- Seed: roles and permissions
-- ---------------------------------------------------------------------------

insert into public.roles (slug, name, description) values
  ('super_admin',      'Super Administrator',         'Complete access to the platform'),
  ('management',       'Business Administrator',      'Oversees operations, approves transactions, views reports'),
  ('property_manager', 'Property Manager',            'Maintains property inventory and listings'),
  ('agent',            'Sales and Rental Agent',      'Works assigned leads, viewings and negotiations'),
  ('finance',          'Accounts / Finance Officer',  'Payment schedules, receipts and collections'),
  ('legal',            'Contract / Legal Officer',    'Contract records, documents and renewals');

insert into public.permissions (slug, description) values
  ('users.manage',                'Create, edit and deactivate staff; assign roles and permissions'),
  ('settings.manage',             'System settings, categories, statuses, reminder rules, website content'),
  ('properties.view',             'View all property records, including unpublished and archived'),
  ('properties.view_assigned',    'View properties assigned to me'),
  ('properties.edit',             'Create and update property records, images and documents'),
  ('properties.publish',          'Publish, approve and unpublish listings'),
  ('properties.archive',          'Archive properties'),
  ('properties.delete',           'Permanently delete properties with no contracts or payments'),
  ('leads.view_all',              'View all leads and enquiries'),
  ('leads.view_assigned',         'View leads assigned to me'),
  ('leads.edit',                  'Create leads, update status, record activities'),
  ('leads.assign',                'Assign and reassign leads; receives new-enquiry alerts'),
  ('customers.view',              'View customer profiles'),
  ('customers.edit',              'Create and update customers; convert leads'),
  ('transactions.view',           'View all sale and purchase transactions'),
  ('transactions.view_own',       'View transactions I am responsible for'),
  ('transactions.edit',           'Create and update transactions; submit for approval'),
  ('transactions.approve',        'Approve or reject submitted transactions'),
  ('transactions.cancel',         'Cancel transactions'),
  ('contracts.view',              'View all contracts and documents'),
  ('contracts.view_own',          'View contracts I am responsible for'),
  ('contracts.edit',              'Create contracts, upload documents, update status and renewals'),
  ('contracts.cancel',            'Cancel or terminate contracts'),
  ('payments.view',               'View payment schedules, payments and balances'),
  ('payments.record',             'Create payment schedules and record payments'),
  ('payments.adjust',             'Void payments and record over-payments (financial adjustments)'),
  ('records.delete',              'Delete leads, customers, transactions, contracts and schedules'),
  ('reports.view',                'View dashboards and reports'),
  ('audit.view',                  'View the audit log and change history');

insert into public.role_permissions (role, permission)
select 'super_admin', slug from public.permissions;

insert into public.role_permissions (role, permission) values
  ('management', 'properties.view'), ('management', 'leads.view_all'), ('management', 'leads.assign'),
  ('management', 'customers.view'), ('management', 'transactions.view'), ('management', 'transactions.approve'),
  ('management', 'contracts.view'), ('management', 'payments.view'), ('management', 'reports.view'),
  ('management', 'audit.view'),

  ('property_manager', 'properties.view'), ('property_manager', 'properties.edit'),
  ('property_manager', 'properties.publish'), ('property_manager', 'properties.archive'),
  ('property_manager', 'leads.view_all'), ('property_manager', 'leads.edit'), ('property_manager', 'leads.assign'),

  ('agent', 'properties.view_assigned'), ('agent', 'leads.view_assigned'), ('agent', 'leads.edit'),
  ('agent', 'customers.view'), ('agent', 'customers.edit'), ('agent', 'transactions.view_own'),
  ('agent', 'transactions.edit'), ('agent', 'contracts.view_own'),

  ('finance', 'customers.view'), ('finance', 'transactions.view'), ('finance', 'contracts.view'),
  ('finance', 'payments.view'), ('finance', 'payments.record'), ('finance', 'reports.view'),

  ('legal', 'properties.view'), ('legal', 'customers.view'), ('legal', 'transactions.view'),
  ('legal', 'contracts.view'), ('legal', 'contracts.edit'), ('legal', 'reports.view');

-- ---------------------------------------------------------------------------
-- Seed: reference lists
-- ---------------------------------------------------------------------------

insert into public.currencies (code, name, symbol, is_default) values
  ('PKR', 'Pakistani Rupee', 'Rs', true),
  ('USD', 'US Dollar', '$', false),
  ('AED', 'UAE Dirham', 'AED', false);

insert into public.area_units (code, name, sqft_factor, sort) values
  ('sqft',  'Square feet',  1,     1),
  ('sqyd',  'Square yards', 9,     2),
  ('marla', 'Marla',        225,   3),
  ('kanal', 'Kanal',        4500,  4),
  ('acre',  'Acre',         43560, 5);

insert into public.property_categories (slug, name, sort) values
  ('residential', 'Residential', 1), ('commercial', 'Commercial', 2), ('industrial', 'Industrial', 3),
  ('agricultural', 'Agricultural', 4), ('land', 'Land and plots', 5);

insert into public.property_types (category_id, slug, name, has_rooms, sort)
select c.id, t.slug, t.name, t.has_rooms, t.sort
from (values
  ('residential',  'house',             'House',                true,  1),
  ('residential',  'apartment',         'Apartment / flat',     true,  2),
  ('residential',  'villa',             'Villa',                true,  3),
  ('residential',  'upper-portion',     'Upper portion',        true,  4),
  ('residential',  'lower-portion',     'Lower portion',        true,  5),
  ('commercial',   'office',            'Office',               false, 1),
  ('commercial',   'shop',              'Shop',                 false, 2),
  ('commercial',   'commercial-building','Commercial building', false, 3),
  ('industrial',   'warehouse',         'Warehouse',            false, 1),
  ('industrial',   'factory',           'Factory',              false, 2),
  ('agricultural', 'agricultural-land', 'Agricultural land',    false, 1),
  ('agricultural', 'farmhouse',         'Farmhouse',            true,  2),
  ('land',         'residential-plot',  'Residential plot',     false, 1),
  ('land',         'commercial-plot',   'Commercial plot',      false, 2)
) as t(category, slug, name, has_rooms, sort)
join public.property_categories c on c.slug = t.category;

insert into public.features (slug, name, sort) values
  ('parking', 'Parking', 1), ('lift', 'Lift', 2), ('security', '24/7 security', 3), ('cctv', 'CCTV', 4),
  ('gas', 'Sui gas', 5), ('electricity', 'Electricity', 6), ('water', 'Water supply', 7),
  ('backup-power', 'Backup power / generator', 8), ('solar', 'Solar panels', 9),
  ('corner', 'Corner plot', 10), ('park-facing', 'Park facing', 11), ('main-boulevard', 'Main boulevard', 12),
  ('servant-quarter', 'Servant quarter', 13), ('basement', 'Basement', 14), ('lawn', 'Lawn / garden', 15),
  ('air-conditioning', 'Air conditioning', 16), ('boundary-wall', 'Boundary wall', 17), ('gated', 'Gated community', 18);

insert into public.availability_statuses (slug, name, show_on_site, sort) values
  ('available',   'Available',   true,  1),
  ('reserved',    'Reserved',    true,  2),
  ('under_offer', 'Under offer', true,  3),
  ('sold',        'Sold',        false, 4),
  ('rented',      'Rented',      false, 5),
  ('withdrawn',   'Withdrawn',   false, 6);

insert into public.lead_sources (slug, name) values
  ('website-inquiry', 'Website inquiry'), ('website-viewing', 'Website viewing request'),
  ('sell-your-property', 'Sell Your Property form'), ('phone', 'Telephone'), ('walk-in', 'Walk-in'),
  ('referral', 'Agent referral'), ('social-media', 'Social media'), ('other', 'Other');

insert into public.party_categories (slug, name) values
  ('buyer', 'Buyer'), ('seller', 'Seller'), ('tenant', 'Tenant'), ('landlord', 'Landlord'),
  ('investor', 'Investor'), ('other', 'Other');

insert into public.lead_statuses (slug, name, sort, is_closed, is_won) values
  ('new', 'New', 1, false, false),
  ('contact-attempted', 'Contact attempted', 2, false, false),
  ('contacted', 'Contacted', 3, false, false),
  ('qualified', 'Qualified', 4, false, false),
  ('shortlisted', 'Property shortlisted', 5, false, false),
  ('viewing-scheduled', 'Viewing scheduled', 6, false, false),
  ('viewing-completed', 'Viewing completed', 7, false, false),
  ('negotiation', 'Negotiation', 8, false, false),
  ('offer', 'Proposal / offer', 9, false, false),
  ('contract-preparation', 'Contract in preparation', 10, false, false),
  ('won', 'Won / converted', 11, true, true),
  ('lost', 'Lost', 12, true, false),
  ('on-hold', 'On hold', 13, false, false);

insert into public.transaction_statuses (slug, name, sort, is_closed) values
  ('inquiry', 'Inquiry', 1, false), ('negotiation', 'Negotiation', 2, false),
  ('offer-submitted', 'Offer submitted', 3, false), ('offer-accepted', 'Offer accepted', 4, false),
  ('contract-preparation', 'Contract preparation', 5, false), ('contract-signed', 'Contract signed', 6, false),
  ('payment-in-progress', 'Payment in progress', 7, false), ('completed', 'Completed', 8, true),
  ('cancelled', 'Cancelled', 9, true), ('on-hold', 'On hold', 10, false);

insert into public.contract_types (slug, name) values
  ('sale', 'Sales agreement'), ('purchase', 'Purchase agreement'), ('rental', 'Rental agreement'),
  ('lease', 'Lease agreement'), ('renewal', 'Renewal'), ('amendment', 'Amendment'),
  ('termination', 'Termination record'), ('other', 'Other');

insert into public.contract_statuses (slug, name, sort, is_terminal) values
  ('draft', 'Draft', 1, false), ('under_review', 'Under review', 2, false),
  ('pending_signature', 'Pending signature', 3, false), ('active', 'Active', 4, false),
  ('expiring_soon', 'Expiring soon', 5, false), ('renewed', 'Renewed', 6, true),
  ('expired', 'Expired', 7, false), ('termination_in_progress', 'Termination in progress', 8, false),
  ('terminated', 'Terminated', 9, true), ('cancelled', 'Cancelled', 10, true);

insert into public.contract_status_transitions (from_status, to_status) values
  ('draft', 'under_review'), ('draft', 'pending_signature'), ('draft', 'cancelled'),
  ('under_review', 'draft'), ('under_review', 'pending_signature'), ('under_review', 'cancelled'),
  ('pending_signature', 'active'), ('pending_signature', 'under_review'), ('pending_signature', 'cancelled'),
  ('active', 'expiring_soon'), ('active', 'renewed'), ('active', 'expired'), ('active', 'termination_in_progress'),
  ('expiring_soon', 'active'), ('expiring_soon', 'renewed'), ('expiring_soon', 'expired'),
  ('expiring_soon', 'termination_in_progress'),
  ('expired', 'renewed'), ('expired', 'terminated'),
  ('termination_in_progress', 'terminated'), ('termination_in_progress', 'active');

insert into public.settings (key, value, is_public) values
  ('business', '{
     "name": "Crescent Realty",
     "tagline": "Homes, plots and commercial property across Pakistan",
     "phone": "+92 42 3500 0000",
     "whatsapp": "+92 300 0000000",
     "email": "info@crescentrealty.example",
     "address": "Office 4, Main Boulevard, Gulberg III, Lahore",
     "hours": "Mon to Sat, 10am to 7pm",
     "about": "We are an independent real estate agency helping families, investors and businesses buy, sell and rent property. Every listing is checked by our team before it goes live, and one agent stays with you from first enquiry to handover."
   }', true),
  ('default_currency', '"PKR"', true),
  ('contract_expiring_soon_days', '30', false),
  ('lead_stale_after_days', '7', false),
  ('publication_requires_approval', 'false', false);
