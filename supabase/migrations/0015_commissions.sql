-- 0015: commission tracking (BRD §22.1).
--   brokerage  earned by the business from a buyer, seller, tenant or landlord
--   agent      payable to a staff member, usually a share of the brokerage
--   referral   payable to an outside referrer
-- Rates come from configurable rules. This is tracking only — not commission accounting (BRD §23).

insert into public.permissions (slug, description) values
  ('commissions.view', 'View all commissions'),
  ('commissions.view_own', 'View commissions payable to me'),
  ('commissions.manage', 'Calculate and edit commissions; record commission payments'),
  ('commissions.approve', 'Approve or cancel commissions');

insert into public.role_permissions (role, permission) values
  ('super_admin', 'commissions.view'), ('super_admin', 'commissions.view_own'), ('super_admin', 'commissions.manage'), ('super_admin', 'commissions.approve'),
  ('management', 'commissions.view'), ('management', 'commissions.approve'),
  ('finance', 'commissions.view'), ('finance', 'commissions.manage'),
  ('agent', 'commissions.view_own');

create table public.commission_rules (
  id          smallint generated always as identity primary key,
  name        text not null,
  kind        text not null check (kind in ('brokerage', 'agent', 'referral')),
  applies_to  text not null check (applies_to in ('sale', 'purchase', 'rental', 'any')),
  basis       text not null check (basis in ('percent_of_price', 'months_rent', 'percent_of_brokerage', 'fixed')),
  rate        numeric(10, 4) not null check (rate >= 0),
  payer_role  text check (payer_role in ('buyer', 'seller', 'tenant', 'landlord')),   -- brokerage: who pays
  active      boolean not null default true,
  sort        smallint not null default 0,
  check (kind <> 'brokerage' or payer_role is not null),
  check (kind = 'brokerage' or basis <> 'months_rent' or applies_to in ('rental', 'any'))
);

insert into public.commission_rules (name, kind, applies_to, basis, rate, payer_role, sort) values
  ('Sale brokerage from buyer (1%)',        'brokerage', 'sale',    'percent_of_price', 1,   'buyer',    1),
  ('Sale brokerage from seller (1%)',       'brokerage', 'sale',    'percent_of_price', 1,   'seller',   2),
  ('Rental brokerage from tenant (½ month)', 'brokerage', 'rental',  'months_rent',      0.5, 'tenant',   3),
  ('Rental brokerage from landlord (½ month)','brokerage','rental', 'months_rent',      0.5, 'landlord', 4),
  ('Agent share of brokerage (25%)',        'agent',     'any',     'percent_of_brokerage', 25, null,    5);

create table public.commissions (
  id                 uuid primary key default gen_random_uuid(),
  ref                text not null unique,
  kind               text not null check (kind in ('brokerage', 'agent', 'referral')),
  rule_id            smallint references public.commission_rules (id) on delete set null,
  property_id        uuid not null references public.properties (id) on delete restrict,
  transaction_id     uuid references public.transactions (id) on delete restrict,
  contract_id        uuid references public.contracts (id) on delete restrict,
  description        text not null,
  base_amount        numeric(14, 2),
  basis              text check (basis in ('percent_of_price', 'months_rent', 'percent_of_brokerage', 'fixed')),
  rate               numeric(10, 4),
  amount             numeric(14, 2) not null check (amount >= 0),
  currency           text not null default 'PKR' references public.currencies (code),
  payer_customer_id  uuid references public.customers (id) on delete restrict,   -- brokerage: client who pays the business
  payee_staff_id     uuid references public.staff (id) on delete restrict,       -- agent: staff member paid
  payee_customer_id  uuid references public.customers (id) on delete restrict,   -- referral: referrer on file
  payee_name         text,                                                      -- referral: referrer not on file
  status             text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  due_date           date,
  paid_on            date,
  payment_method     text check (payment_method in ('cash', 'bank_transfer', 'cheque', 'pay_order', 'online', 'other')),
  payment_reference  text,
  notes              text,
  approved_by        uuid references public.staff (id) on delete set null,
  approved_at        timestamptz,
  cancelled_reason   text,
  created_by         uuid references public.staff (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (transaction_id is not null or contract_id is not null),
  check (kind <> 'agent' or payee_staff_id is not null),
  check (kind <> 'referral' or payee_customer_id is not null or payee_name is not null),
  check (status <> 'paid' or paid_on is not null),
  check (status <> 'cancelled' or cancelled_reason is not null)
);
create sequence public.commission_ref_seq;
alter table public.commissions alter column ref set default 'CM-' || lpad(nextval('public.commission_ref_seq')::text, 6, '0');
create index commissions_transaction_idx on public.commissions (transaction_id);
create index commissions_contract_idx on public.commissions (contract_id);
create index commissions_property_idx on public.commissions (property_id);
create index commissions_payee_staff_idx on public.commissions (payee_staff_id, status);
create index commissions_payer_idx on public.commissions (payer_customer_id);
create index commissions_payee_customer_idx on public.commissions (payee_customer_id);
create index commissions_rule_idx on public.commissions (rule_id);
create index commissions_status_idx on public.commissions (status, due_date);
create index commissions_approved_by_idx on public.commissions (approved_by);
create index commissions_created_by_idx on public.commissions (created_by);
-- One live commission per rule, party and deal, so recalculating never duplicates.
create unique index commissions_rule_uniq on public.commissions
  (rule_id, coalesce(transaction_id, contract_id), coalesce(payer_customer_id, payee_staff_id))
  where status <> 'cancelled' and rule_id is not null;

create or replace function public.commissions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status <> 'pending' then raise exception 'New commissions start as pending'; end if;
    return new;
  end if;

  if old.status in ('paid', 'cancelled') and (to_jsonb(new) - array['notes', 'updated_at']) is distinct from (to_jsonb(old) - array['notes', 'updated_at']) then
    raise exception 'A % commission cannot be changed', old.status;
  end if;
  if old.status = 'approved' and new.status = 'approved'
     and (new.amount is distinct from old.amount or new.payee_staff_id is distinct from old.payee_staff_id
          or new.payee_customer_id is distinct from old.payee_customer_id or new.payer_customer_id is distinct from old.payer_customer_id) then
    raise exception 'Approved commissions are locked. Cancel and recreate it, or move it back to pending first.';
  end if;
  if new.status is distinct from old.status then
    if new.status in ('approved', 'cancelled') or (old.status = 'approved' and new.status = 'pending') then
      if not public.has_permission('commissions.approve') then
        raise exception 'You do not have permission to approve or cancel commissions';
      end if;
    end if;
    if new.status = 'approved' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
    if new.status = 'paid' then
      if old.status <> 'approved' then raise exception 'Approve the commission before recording it as paid'; end if;
      if not public.has_permission('commissions.manage') then raise exception 'You do not have permission to record commission payments'; end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger commissions_before_write before insert or update on public.commissions
  for each row execute function public.commissions_before_write();

create trigger commissions_audit after insert or update or delete on public.commissions
  for each row execute function public.audit_trigger();
create trigger commission_rules_audit after insert or update or delete on public.commission_rules
  for each row execute function public.audit_trigger();

-- Applies the active rules to a completed sale/purchase or an active rental contract.
-- Safe to run again: existing live commissions for the same rule and party are skipped.
create or replace function public.calculate_commissions(p_transaction uuid default null, p_contract uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal_type text;
  v_property uuid;
  v_currency text;
  v_price numeric;
  v_rent numeric;
  v_agent uuid;
  v_label text;
  v_before integer := (select count(*) from public.commissions);
  v_brokerage numeric;
  r public.commission_rules;
begin
  -- Called directly, the user needs commissions.manage. Called from the deal-completion triggers
  -- (trigger depth > 0), it runs for whoever completed the deal.
  if auth.uid() is not null and pg_trigger_depth() = 0 and not public.has_permission('commissions.manage') then
    raise exception 'You do not have permission to calculate commissions';
  end if;
  if (p_transaction is null) = (p_contract is null) then
    raise exception 'Pass either a transaction or a contract';
  end if;

  if p_transaction is not null then
    select t.kind, t.property_id, t.currency, t.agreed_price, t.agent_id, t.ref
      into v_deal_type, v_property, v_currency, v_price, v_agent, v_label
    from public.transactions t where t.id = p_transaction;
  else
    select case when ct.slug in ('rental', 'lease', 'renewal') then 'rental' else ct.slug end,
           c.property_id, c.currency, coalesce(c.value, c.rent_amount * 12), c.rent_amount, c.responsible_id, c.ref
      into v_deal_type, v_property, v_currency, v_price, v_rent, v_agent, v_label
    from public.contracts c join public.contract_types ct on ct.id = c.type_id where c.id = p_contract;
  end if;
  if v_property is null then raise exception 'Deal not found'; end if;

  -- Brokerage: one row per matching rule and per party holding the payer role.
  for r in select * from public.commission_rules where active and kind = 'brokerage' and applies_to in (v_deal_type, 'any') order by sort loop
    insert into public.commissions (kind, rule_id, property_id, transaction_id, contract_id, description,
                                    base_amount, basis, rate, amount, currency, payer_customer_id, due_date)
    select 'brokerage', r.id, v_property, p_transaction, p_contract, r.name || ' — ' || v_label,
           case r.basis when 'months_rent' then v_rent else v_price end, r.basis, r.rate,
           round(case r.basis when 'percent_of_price' then v_price * r.rate / 100
                              when 'months_rent' then v_rent * r.rate
                              when 'fixed' then r.rate else 0 end, 0),
           v_currency, party.customer_id, current_date + 7
    from (
      select customer_id from public.transaction_parties
        where transaction_id = p_transaction and role in (r.payer_role, 'co_' || r.payer_role)
      union
      select customer_id from public.contract_parties
        where contract_id = p_contract and role = r.payer_role
    ) party
    where case r.basis when 'months_rent' then v_rent else v_price end is not null or r.basis = 'fixed'
    on conflict do nothing;
  end loop;

  select coalesce(sum(amount), 0) into v_brokerage
  from public.commissions
  where kind = 'brokerage' and status <> 'cancelled'
    and (transaction_id = p_transaction or contract_id = p_contract);

  -- Agent: paid to the responsible staff member.
  if v_agent is not null then
    for r in select * from public.commission_rules where active and kind = 'agent' and applies_to in (v_deal_type, 'any') order by sort loop
      insert into public.commissions (kind, rule_id, property_id, transaction_id, contract_id, description,
                                      base_amount, basis, rate, amount, currency, payee_staff_id, due_date)
      values ('agent', r.id, v_property, p_transaction, p_contract, r.name || ' — ' || v_label,
              case r.basis when 'percent_of_brokerage' then v_brokerage when 'months_rent' then v_rent else v_price end,
              r.basis, r.rate,
              round(case r.basis when 'percent_of_brokerage' then v_brokerage * r.rate / 100
                                 when 'percent_of_price' then v_price * r.rate / 100
                                 when 'months_rent' then coalesce(v_rent, 0) * r.rate
                                 else r.rate end, 0),
              v_currency, v_agent, (date_trunc('month', current_date) + interval '1 month')::date)
      on conflict do nothing;
    end loop;
  end if;

  return (select count(*) from public.commissions) - v_before;
end;
$$;

revoke execute on function public.calculate_commissions(uuid, uuid) from public, anon;
grant execute on function public.calculate_commissions(uuid, uuid) to authenticated;

-- Calculate automatically when a sale/purchase is completed or a rental contract becomes active.
create or replace function public.transactions_auto_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status_id = (select id from public.transaction_statuses where slug = 'completed')
     and old.status_id is distinct from new.status_id then
    perform public.calculate_commissions(p_transaction => new.id);
  end if;
  return null;
end;
$$;

create trigger transactions_auto_commission after update of status_id on public.transactions
  for each row execute function public.transactions_auto_commission();

create or replace function public.contracts_auto_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' and new.transaction_id is null
     and exists (select 1 from public.contract_types ct where ct.id = new.type_id and ct.slug in ('rental', 'lease', 'renewal')) then
    perform public.calculate_commissions(p_contract => new.id);
  end if;
  return null;
end;
$$;

create trigger contracts_auto_commission after update of status on public.contracts
  for each row execute function public.contracts_auto_commission();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.commission_rules enable row level security;
alter table public.commissions enable row level security;
grant select, insert, update, delete on public.commission_rules to authenticated;
grant select, insert, update on public.commissions to authenticated;

create policy "Staff read commission rules" on public.commission_rules for select to authenticated using ((select public.is_staff()));
create policy "Administrators manage commission rules" on public.commission_rules for all to authenticated
  using ((select public.has_permission('settings.manage'))) with check ((select public.has_permission('settings.manage')));

create policy "Commission viewers" on public.commissions for select to authenticated
  using ((select public.has_permission('commissions.view'))
         or ((select public.has_permission('commissions.view_own')) and payee_staff_id = (select auth.uid())));
create policy "Commission managers create" on public.commissions for insert to authenticated
  with check ((select public.has_permission('commissions.manage')));
create policy "Commission managers and approvers update" on public.commissions for update to authenticated
  using ((select public.has_permission('commissions.manage')) or (select public.has_permission('commissions.approve')))
  with check (true);

create view public.report_commissions with (security_invoker = true) as
select c.id, c.ref, c.kind, c.status, c.description, c.amount, c.currency, c.due_date, c.paid_on, c.created_at,
       c.payee_staff_id, s.full_name as agent, coalesce(pc.full_name, c.payee_name) as referrer, payer.full_name as payer,
       p.ref as property_ref, p.title as property_title, t.ref as transaction_ref, ct.ref as contract_ref
from public.commissions c
join public.properties p on p.id = c.property_id
left join public.staff s on s.id = c.payee_staff_id
left join public.customers pc on pc.id = c.payee_customer_id
left join public.customers payer on payer.id = c.payer_customer_id
left join public.transactions t on t.id = c.transaction_id
left join public.contracts ct on ct.id = c.contract_id;
grant select on public.report_commissions to authenticated;
