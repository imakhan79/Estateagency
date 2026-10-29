-- 0011: support for the staff admin portal — branches (BRD §14.5), lost-lead reasons (§12.3),
-- pending sign-ups for user management, and a guard so the last super administrator can't be removed.

create table public.branches (
  id       smallint generated always as identity primary key,
  name     text not null unique,
  city     text,
  address  text,
  phone    text,
  active   boolean not null default true
);
insert into public.branches (name, city) values ('Head office', 'Lahore');

alter table public.staff add column branch_id smallint references public.branches (id) on delete set null;
alter table public.properties add column branch_id smallint references public.branches (id) on delete set null;
create index staff_branch_idx on public.staff (branch_id);
create index properties_branch_idx on public.properties (branch_id);

alter table public.branches enable row level security;
grant select, insert, update, delete on public.branches to authenticated;
create policy "Staff read branches" on public.branches for select to authenticated using ((select public.is_staff()));
create policy "Administrators manage branches" on public.branches for all to authenticated
  using ((select public.has_permission('settings.manage'))) with check ((select public.has_permission('settings.manage')));

alter table public.leads add column lost_reason text;

-- Accounts that signed up but have not been given a staff role yet.
create or replace function public.pending_signups()
returns table (id uuid, email text, full_name text, created_at timestamptz, confirmed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('users.manage') then
    raise exception 'You do not have permission to manage users';
  end if;
  return query
    select u.id, u.email::text, coalesce(u.raw_user_meta_data ->> 'full_name', '')::text, u.created_at,
           u.email_confirmed_at is not null
    from auth.users u
    where not exists (select 1 from public.staff s where s.id = u.id)
    order by u.created_at desc;
end;
$$;
revoke execute on function public.pending_signups() from public, anon;
grant execute on function public.pending_signups() to authenticated;

create or replace function public.staff_keep_one_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE' and old.role = 'super_admin' and old.active)
     or (tg_op = 'UPDATE' and old.role = 'super_admin' and old.active and (new.role <> 'super_admin' or not new.active)) then
    if not exists (select 1 from public.staff where role = 'super_admin' and active and id <> old.id) then
      raise exception 'There must be at least one active Super Administrator';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger staff_keep_one_admin before update or delete on public.staff
  for each row execute function public.staff_keep_one_admin();
