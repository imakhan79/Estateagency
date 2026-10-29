-- 0009: business rules BR-06, BR-07, BR-18 and BR-19.

-- BR-19: flag possible duplicate customers by mobile, email or CNIC.
alter table public.customers add column possible_duplicate_of uuid references public.customers (id) on delete set null;
create index customers_duplicate_idx on public.customers (possible_duplicate_of);
create index customers_cnic_idx on public.customers (regexp_replace(cnic, '\D', '', 'g')) where cnic is not null;

create or replace function public.customers_flag_duplicate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.mobile is distinct from old.mobile or new.email is distinct from old.email
     or new.cnic is distinct from old.cnic then
    select c.id into new.possible_duplicate_of
    from public.customers c
    where c.id <> new.id and (
      (public.normalize_mobile(new.mobile) is not null and c.mobile_normalized = public.normalize_mobile(new.mobile))
      or (new.email is not null and lower(c.email) = lower(new.email))
      or (new.cnic is not null and regexp_replace(c.cnic, '\D', '', 'g') = regexp_replace(new.cnic, '\D', '', 'g'))
    )
    order by c.created_at
    limit 1;
  end if;
  return new;
end;
$$;

create trigger customers_flag_duplicate before insert or update on public.customers
  for each row execute function public.customers_flag_duplicate();

-- Lookup used by staff forms before creating a lead or customer.
create or replace function public.find_possible_duplicates(p_mobile text, p_email text default null, p_cnic text default null)
returns table (kind text, id uuid, ref text, name text, mobile text, email text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select 'customer', c.id, c.ref, c.full_name, c.mobile, c.email, c.created_at
  from public.customers c
  where (public.normalize_mobile(p_mobile) is not null and c.mobile_normalized = public.normalize_mobile(p_mobile))
     or (nullif(p_email, '') is not null and lower(c.email) = lower(p_email))
     or (nullif(p_cnic, '') is not null and regexp_replace(c.cnic, '\D', '', 'g') = regexp_replace(p_cnic, '\D', '', 'g'))
  union all
  select 'lead', l.id, l.ref, l.name, l.mobile, l.email, l.created_at
  from public.leads l
  where (public.normalize_mobile(p_mobile) is not null and l.mobile_normalized = public.normalize_mobile(p_mobile))
     or (nullif(p_email, '') is not null and lower(l.email) = lower(p_email))
  order by 7 desc
  limit 20;
$$;
grant execute on function public.find_possible_duplicates(text, text, text) to authenticated;

-- BR-06 / BR-07: a contract cannot become pending signature or active without its parties.
-- BR-18: a transaction is completed only when it has buyer and seller, a signed contract,
-- approval (if it was submitted), and every incoming payment settled.
create or replace function public.contracts_require_parties()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('pending_signature', 'active') and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and auth.uid() is not null
     and not exists (select 1 from public.contract_parties where contract_id = new.id) then
    raise exception 'Add the contracting parties before moving this contract to %', replace(new.status, '_', ' ');
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) and new.start_date is null then
    raise exception 'Set the contract start date before activating it';
  end if;
  return new;
end;
$$;

create trigger contracts_require_parties before insert or update of status on public.contracts
  for each row execute function public.contracts_require_parties();

create or replace function public.transaction_completion_issues(p_transaction uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_remove(array[
    case when not exists (select 1 from public.transaction_parties where transaction_id = t.id and role in ('buyer', 'co_buyer'))
         then 'Add the buyer' end,
    case when not exists (select 1 from public.transaction_parties where transaction_id = t.id and role in ('seller', 'co_seller'))
         then 'Add the seller' end,
    case when not exists (select 1 from public.contracts c where c.transaction_id = t.id
                          and (c.signed_on is not null or c.status in ('active', 'expiring_soon', 'renewed', 'expired')))
         then 'Record the signed contract' end,
    case when t.approval_status in ('pending', 'rejected') then 'Transaction approval is ' || t.approval_status end,
    case when exists (select 1 from public.installment_balances b where b.transaction_id = t.id and b.outstanding > 0)
         then 'Payments are still outstanding' end
  ], null)
  from public.transactions t where t.id = p_transaction;
$$;
grant execute on function public.transaction_completion_issues(uuid) to authenticated;

create or replace function public.transactions_check_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_issues text[];
begin
  if new.status_id = (select id from public.transaction_statuses where slug = 'completed')
     and old.status_id is distinct from new.status_id then
    v_issues := public.transaction_completion_issues(new.id);
    if cardinality(v_issues) > 0 then
      raise exception 'This transaction cannot be completed yet: %', array_to_string(v_issues, '; ');
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_check_completion before update of status_id on public.transactions
  for each row execute function public.transactions_check_completion();

-- BR-08: a schedule must name its payer and its obligation (contract or transaction).
alter table public.payment_schedules validate constraint payment_schedules_reference_check;
