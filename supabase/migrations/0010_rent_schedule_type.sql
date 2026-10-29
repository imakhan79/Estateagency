-- 0010: rent schedules are saved with payment_type 'rent'.

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

  insert into public.payment_schedules (title, customer_id, property_id, contract_id, currency, payment_type)
  values ('Rent for ' || c.ref, v_tenant, c.property_id, c.id, c.currency, 'rent')
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
