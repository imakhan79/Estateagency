-- 0004: sale/purchase transactions, contracts and documents, payment schedules, installments and receipts (BRD §7, §8, §9, §2)

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,
  kind             text not null check (kind in ('sale', 'purchase')),
  property_id      uuid not null references public.properties (id) on delete restrict,
  lead_id          uuid references public.leads (id) on delete set null,
  status_id        smallint not null references public.transaction_statuses (id),
  transaction_date date not null default current_date,
  agreed_price     numeric(14, 2) check (agreed_price >= 0),
  currency         text not null default 'PKR' references public.currencies (code),
  deposit          numeric(14, 2) check (deposit >= 0),
  payment_terms    text,
  agent_id         uuid references public.staff (id) on delete set null,
  approval_status  text not null default 'not_required'
                     check (approval_status in ('not_required', 'pending', 'approved', 'rejected')),
  approved_by      uuid references public.staff (id) on delete set null,
  approved_at      timestamptz,
  approval_note    text,
  notes            text,
  created_by       uuid references public.staff (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create sequence public.transaction_ref_seq;
alter table public.transactions alter column ref set default 'TX-' || lpad(nextval('public.transaction_ref_seq')::text, 6, '0');
create index transactions_property_idx on public.transactions (property_id);
create index transactions_agent_idx on public.transactions (agent_id);
create index transactions_status_idx on public.transactions (status_id);
create index transactions_lead_idx on public.transactions (lead_id);
create index transactions_pending_idx on public.transactions (created_at) where approval_status = 'pending';

create table public.transaction_parties (
  transaction_id  uuid not null references public.transactions (id) on delete cascade,
  customer_id     uuid not null references public.customers (id) on delete restrict,
  role            text not null check (role in ('buyer', 'seller', 'co_buyer', 'co_seller', 'guarantor', 'witness', 'other')),
  primary key (transaction_id, customer_id, role)
);
create index transaction_parties_customer_idx on public.transaction_parties (customer_id);

create or replace function public.transactions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cancelled smallint := (select id from public.transaction_statuses where slug = 'cancelled');
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.agent_id := coalesce(new.agent_id, auth.uid());
  else
    new.updated_at := now();
  end if;

  if new.status_id = v_cancelled and (tg_op = 'INSERT' or old.status_id is distinct from new.status_id)
     and not public.has_permission('transactions.cancel') then
    raise exception 'You do not have permission to cancel transactions';
  end if;

  if new.approval_status in ('approved', 'rejected')
     and (tg_op = 'INSERT' or old.approval_status is distinct from new.approval_status) then
    if not public.has_permission('transactions.approve') then
      raise exception 'You do not have permission to approve transactions';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;

  -- Material changes to an approved deal send it back for approval.
  if tg_op = 'UPDATE' and old.approval_status = 'approved' and new.approval_status = 'approved'
     and (old.agreed_price is distinct from new.agreed_price or old.deposit is distinct from new.deposit
          or old.payment_terms is distinct from new.payment_terms)
     and not public.has_permission('transactions.approve') then
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

create trigger transactions_before_write before insert or update on public.transactions
  for each row execute function public.transactions_before_write();

create or replace function public.transactions_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.approval_status = 'pending' and (tg_op = 'INSERT' or old.approval_status is distinct from 'pending') then
    perform public.notify_permission_holders('transactions.approve', 'approval',
      'Transaction ' || new.ref || ' needs approval', null, 'transaction', new.id,
      'approval:' || new.id || ':' || extract(epoch from now())::bigint);
  end if;
  return null;
end;
$$;

create trigger transactions_after_write after insert or update of approval_status on public.transactions
  for each row execute function public.transactions_after_write();

-- ---------------------------------------------------------------------------
-- Contracts
-- ---------------------------------------------------------------------------

create table public.contracts (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text not null unique,
  type_id              smallint not null references public.contract_types (id),
  status               text not null default 'draft' references public.contract_statuses (slug),
  property_id          uuid not null references public.properties (id) on delete restrict,
  transaction_id       uuid references public.transactions (id) on delete restrict,
  previous_contract_id uuid references public.contracts (id) on delete restrict,   -- renewal / amendment chain
  title                text,
  start_date           date,
  end_date             date,
  signed_on            date,
  value                numeric(14, 2) check (value >= 0),
  currency             text not null default 'PKR' references public.currencies (code),
  payment_terms        text,
  renewal_terms        text,
  -- Rental / lease terms (BRD §8.2)
  rent_amount          numeric(14, 2) check (rent_amount >= 0),
  security_deposit     numeric(14, 2) check (security_deposit >= 0),
  advance_rent         numeric(14, 2) check (advance_rent >= 0),
  payment_frequency    text check (payment_frequency in ('monthly', 'quarterly', 'semi_annual', 'annual', 'one_off')),
  payment_due_day      smallint check (payment_due_day between 1 and 28),
  renewal_status       text check (renewal_status in ('not_contacted', 'discussion', 'proposed', 'renewed', 'not_renewing', 'terminating', 'expired')),
  next_action_date     date,
  terminated_on        date,
  termination_reason   text,
  responsible_id       uuid references public.staff (id) on delete set null,
  notes                text,
  created_by           uuid references public.staff (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create sequence public.contract_ref_seq;
alter table public.contracts alter column ref set default 'CT-' || lpad(nextval('public.contract_ref_seq')::text, 6, '0');
create index contracts_property_idx on public.contracts (property_id);
create index contracts_transaction_idx on public.contracts (transaction_id);
create index contracts_previous_idx on public.contracts (previous_contract_id);
create index contracts_responsible_idx on public.contracts (responsible_id);
create index contracts_type_idx on public.contracts (type_id);
create index contracts_expiry_idx on public.contracts (end_date) where status in ('active', 'expiring_soon');

create table public.contract_parties (
  contract_id  uuid not null references public.contracts (id) on delete cascade,
  customer_id  uuid not null references public.customers (id) on delete restrict,
  role         text not null check (role in ('tenant', 'landlord', 'buyer', 'seller', 'owner', 'guarantor', 'other')),
  primary key (contract_id, customer_id, role)
);
create index contract_parties_customer_idx on public.contract_parties (customer_id);

-- Every upload is kept; a new version never replaces the old row (BRD §9.4).
create table public.contract_documents (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.contracts (id) on delete restrict,
  kind          text not null default 'contract' check (kind in ('contract', 'amendment', 'renewal', 'termination', 'supporting')),
  version       smallint not null default 1,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  notes         text,
  uploaded_by   uuid references public.staff (id) on delete set null,
  uploaded_at   timestamptz not null default now(),
  unique (contract_id, kind, version)
);

create or replace function public.contract_documents_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mime_type not in (
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png'
  ) then
    raise exception 'Upload a PDF, Word, Excel, JPEG or PNG file';
  end if;
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  select coalesce(max(d.version), 0) + 1 into new.version
  from public.contract_documents d where d.contract_id = new.contract_id and d.kind = new.kind;
  return new;
end;
$$;

create trigger contract_documents_before_insert before insert on public.contract_documents
  for each row execute function public.contract_documents_before_insert();

create or replace function public.contracts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  if auth.uid() is null then
    return new;   -- system jobs (expiry checks) skip permission checks
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.responsible_id := coalesce(new.responsible_id, auth.uid());
    if new.status not in ('draft', 'under_review', 'pending_signature', 'active') then
      raise exception 'New contracts start as draft, under review, pending signature or active';
    end if;
  elsif old.status is distinct from new.status then
    if not exists (select 1 from public.contract_status_transitions t
                   where t.from_status = old.status and t.to_status = new.status) then
      raise exception 'A contract cannot move from % to %', old.status, new.status;
    end if;
  end if;

  if new.status in ('cancelled', 'terminated') and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and not public.has_permission('contracts.cancel') then
    raise exception 'You do not have permission to cancel or terminate contracts';
  end if;

  if new.status = 'terminated' then
    new.terminated_on := coalesce(new.terminated_on, current_date);
  end if;
  return new;
end;
$$;

create trigger contracts_before_write before insert or update on public.contracts
  for each row execute function public.contracts_before_write();

-- Creates the renewed agreement as a new contract linked to the old one; the old terms stay untouched (BRD §8.4).
create or replace function public.renew_contract(p_contract uuid, p_start date, p_end date, p_rent numeric default null, p_value numeric default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_old public.contracts;
  v_new uuid;
begin
  select * into v_old from public.contracts where id = p_contract;
  if not found then raise exception 'Contract not found'; end if;
  if v_old.status not in ('active', 'expiring_soon', 'expired') then
    raise exception 'Only active, expiring or expired contracts can be renewed';
  end if;

  insert into public.contracts (type_id, status, property_id, transaction_id, previous_contract_id, title,
                                start_date, end_date, value, currency, payment_terms, renewal_terms,
                                rent_amount, security_deposit, advance_rent, payment_frequency, payment_due_day,
                                responsible_id, notes)
  values (v_old.type_id, 'draft', v_old.property_id, v_old.transaction_id, v_old.id, v_old.title,
          p_start, p_end, coalesce(p_value, v_old.value), v_old.currency, v_old.payment_terms, v_old.renewal_terms,
          coalesce(p_rent, v_old.rent_amount), v_old.security_deposit, null, v_old.payment_frequency, v_old.payment_due_day,
          v_old.responsible_id, 'Renewal of ' || v_old.ref)
  returning id into v_new;

  insert into public.contract_parties (contract_id, customer_id, role)
  select v_new, customer_id, role from public.contract_parties where contract_id = v_old.id;

  update public.contracts set status = 'renewed', renewal_status = 'renewed' where id = v_old.id;
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment schedules, installments and payments
-- ---------------------------------------------------------------------------

create table public.payment_schedules (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,
  title           text not null,
  customer_id     uuid not null references public.customers (id) on delete restrict,   -- who pays
  property_id     uuid not null references public.properties (id) on delete restrict,
  contract_id     uuid references public.contracts (id) on delete restrict,
  transaction_id  uuid references public.transactions (id) on delete restrict,
  direction       text not null default 'incoming' check (direction in ('incoming', 'outgoing')),  -- outgoing = client paying a seller
  currency        text not null default 'PKR' references public.currencies (code),
  notes           text,
  created_by      uuid references public.staff (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create sequence public.schedule_ref_seq;
alter table public.payment_schedules alter column ref set default 'PS-' || lpad(nextval('public.schedule_ref_seq')::text, 6, '0');
create index payment_schedules_customer_idx on public.payment_schedules (customer_id);
create index payment_schedules_property_idx on public.payment_schedules (property_id);
create index payment_schedules_contract_idx on public.payment_schedules (contract_id);
create index payment_schedules_transaction_idx on public.payment_schedules (transaction_id);
create trigger payment_schedules_updated_at before update on public.payment_schedules
  for each row execute function public.set_updated_at();

-- A full payment is a schedule with a single installment.
create table public.installments (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null references public.payment_schedules (id) on delete cascade,
  seq          smallint not null,
  description  text not null,
  due_date     date not null,
  amount       numeric(14, 2) not null check (amount > 0),
  waived_at    timestamptz,
  waived_by    uuid references public.staff (id) on delete set null,
  unique (schedule_id, seq)
);
create index installments_due_idx on public.installments (due_date) where waived_at is null;

create sequence public.receipt_seq;

-- Payments form a ledger: never edited or deleted, only voided with a reason (BRD §3.2 restriction).
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  receipt_no      text not null unique default 'RC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0'),
  installment_id  uuid not null references public.installments (id) on delete restrict,
  schedule_id     uuid not null references public.payment_schedules (id) on delete restrict,
  customer_id     uuid not null references public.customers (id) on delete restrict,
  amount          numeric(14, 2) not null check (amount > 0),
  currency        text not null references public.currencies (code),
  paid_on         date not null default current_date,
  method          text not null check (method in ('cash', 'bank_transfer', 'cheque', 'online', 'pay_order', 'other')),
  reference_no    text,
  notes           text,
  recorded_by     uuid references public.staff (id) on delete set null,
  recorded_at     timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid references public.staff (id) on delete set null,
  void_reason     text,
  check (voided_at is null or void_reason is not null)
);
create index payments_installment_idx on public.payments (installment_id) where voided_at is null;
create index payments_schedule_idx on public.payments (schedule_id);
create index payments_customer_idx on public.payments (customer_id);
create index payments_paid_on_idx on public.payments (paid_on);

create or replace function public.payments_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_inst public.installments;
  v_paid numeric;
begin
  select * into v_inst from public.installments where id = new.installment_id;
  if v_inst.waived_at is not null then
    raise exception 'This installment has been waived';
  end if;

  new.schedule_id := v_inst.schedule_id;
  select s.customer_id, s.currency into new.customer_id, new.currency
  from public.payment_schedules s where s.id = v_inst.schedule_id;
  new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  new.recorded_at := now();
  new.voided_at := null;

  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p where p.installment_id = new.installment_id and p.voided_at is null;

  if v_paid + new.amount > v_inst.amount and auth.uid() is not null and not public.has_permission('payments.adjust') then
    raise exception 'Payment of % exceeds the outstanding % on this installment', new.amount, v_inst.amount - v_paid;
  end if;
  return new;
end;
$$;

create trigger payments_before_insert before insert on public.payments
  for each row execute function public.payments_before_insert();

create or replace function public.payments_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason', 'notes'])
     is distinct from (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason', 'notes']) then
    raise exception 'Payments cannot be edited. Void the payment and record it again.';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'A voided payment cannot be restored';
  end if;
  if new.voided_at is not null and old.voided_at is null then
    if auth.uid() is not null and not public.has_permission('payments.adjust') then
      raise exception 'You do not have permission to void payments';
    end if;
    new.voided_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger payments_before_update before update on public.payments
  for each row execute function public.payments_before_update();

create or replace function public.payments_block_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Payments cannot be deleted. Void the payment instead.';
end;
$$;

create trigger payments_block_delete before delete on public.payments
  for each row execute function public.payments_block_delete();

-- Splits a total into equal installments; the last one absorbs rounding.
create or replace function public.add_installments(
  p_schedule uuid, p_total numeric, p_count int, p_first_due date,
  p_every interval default interval '1 month', p_label text default 'Installment'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_start smallint := coalesce((select max(seq) from public.installments where schedule_id = p_schedule), 0);
  v_each numeric := round(p_total / p_count, 0);
begin
  if p_count < 1 or p_count > 600 then raise exception 'Installment count must be between 1 and 600'; end if;
  if p_total <= 0 then raise exception 'Total must be greater than zero'; end if;

  insert into public.installments (schedule_id, seq, description, due_date, amount)
  select p_schedule, v_start + i,
         case when p_count = 1 then p_label else p_label || ' ' || i || ' of ' || p_count end,
         (p_first_due + (i - 1) * p_every)::date,
         case when i = p_count then p_total - v_each * (p_count - 1) else v_each end
  from generate_series(1, p_count) i;
end;
$$;

-- Builds the rent schedule for a rental/lease contract from its dates and frequency (BRD §8.3 step 8).
create or replace function public.create_rent_schedule(p_contract uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  c public.contracts;
  v_schedule uuid;
  v_tenant uuid;
  v_months int;
  v_step interval;
  v_due date;
  v_seq smallint := 0;
begin
  select * into c from public.contracts where id = p_contract;
  if c.rent_amount is null or c.start_date is null or c.end_date is null or c.payment_frequency is null then
    raise exception 'Set rent, start date, end date and payment frequency first';
  end if;
  select customer_id into v_tenant from public.contract_parties where contract_id = c.id and role = 'tenant' limit 1;
  if v_tenant is null then raise exception 'Add the tenant to the contract first'; end if;

  v_months := case c.payment_frequency when 'monthly' then 1 when 'quarterly' then 3
                                       when 'semi_annual' then 6 when 'annual' then 12 else 0 end;
  v_step := make_interval(months => greatest(v_months, 1));

  insert into public.payment_schedules (title, customer_id, property_id, contract_id, currency)
  values ('Rent for ' || c.ref, v_tenant, c.property_id, c.id, c.currency)
  returning id into v_schedule;

  if coalesce(c.security_deposit, 0) > 0 then
    v_seq := v_seq + 1;
    insert into public.installments (schedule_id, seq, description, due_date, amount)
    values (v_schedule, v_seq, 'Security deposit', c.start_date, c.security_deposit);
  end if;
  if coalesce(c.advance_rent, 0) > 0 then
    v_seq := v_seq + 1;
    insert into public.installments (schedule_id, seq, description, due_date, amount)
    values (v_schedule, v_seq, 'Advance rent', c.start_date, c.advance_rent);
  end if;

  if v_months = 0 then
    v_seq := v_seq + 1;
    insert into public.installments (schedule_id, seq, description, due_date, amount)
    values (v_schedule, v_seq, 'Rent', c.start_date, c.rent_amount);
  else
    v_due := c.start_date;
    if c.payment_due_day is not null then
      v_due := make_date(extract(year from v_due)::int, extract(month from v_due)::int, c.payment_due_day);
      if v_due < c.start_date then v_due := (v_due + interval '1 month')::date; end if;
    end if;
    while v_due <= c.end_date loop
      v_seq := v_seq + 1;
      insert into public.installments (schedule_id, seq, description, due_date, amount)
      values (v_schedule, v_seq, 'Rent ' || to_char(v_due, 'Mon YYYY'), v_due, c.rent_amount * v_months);
      v_due := (v_due + v_step)::date;
    end loop;
  end if;
  return v_schedule;
end;
$$;
