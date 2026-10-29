-- 0006: grants, row level security and storage buckets (BRD §3 role-based access, §3.7 visitors)
--
-- Model: website visitors (anon) can read published listings and reference data, and submit forms
-- through public.submit_inquiry(). Everything else requires a signed-in, active staff account, and
-- each table checks the specific permission from public.has_permission().

-- ---------------------------------------------------------------------------
-- Table privileges. Supabase grants everything to anon/authenticated by default; start from nothing.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on all sequences in schema public to authenticated;

-- Reference data: readable by everyone, editable by staff with settings.manage (via RLS below).
grant select on public.currencies, public.area_units, public.property_categories, public.property_types,
  public.features, public.availability_statuses, public.settings
  to anon;
grant select, insert, update, delete on public.currencies, public.area_units, public.property_categories,
  public.property_types, public.features, public.availability_statuses, public.lead_sources,
  public.party_categories, public.lead_statuses, public.transaction_statuses, public.contract_types,
  public.contract_statuses, public.contract_status_transitions, public.settings, public.reminder_rules
  to authenticated;

-- Visitors only ever see the public columns of a listing.
grant select (id, ref, slug, title, description, category_id, type_id, listing_type, price, currency, country,
  city, area, public_address, size, size_unit, bedrooms, bathrooms, floors, furnishing, featured, availability,
  publication, video_urls, seo_title, seo_description, published_at, created_at, updated_at)
  on public.properties to anon;
grant select on public.property_features to anon;
grant select (id, property_id, kind, storage_path, external_url, alt, sort, is_public) on public.property_media to anon;

grant select, insert, update, delete on public.properties, public.property_features, public.property_media,
  public.customers, public.customer_categories, public.leads, public.activities, public.transactions,
  public.transaction_parties, public.contracts, public.contract_parties, public.payment_schedules,
  public.installments, public.staff, public.staff_permissions, public.role_permissions
  to authenticated;
grant select, insert, update on public.contract_documents, public.payments, public.notifications to authenticated;
grant delete on public.contract_documents to authenticated;
grant select on public.roles, public.permissions, public.property_history, public.audit_log to authenticated;
grant select on public.installment_balances, public.schedule_balances, public.contract_renewals,
  public.report_inventory, public.report_lead_pipeline, public.report_collections, public.report_agent_activity
  to authenticated;

-- Functions callable from the website and the staff app. Everything else stays internal.
grant execute on function public.submit_inquiry(text, text, text, text, text, text, text, date, jsonb) to anon, authenticated;
grant execute on function public.has_permission(text), public.is_staff(), public.my_permissions(),
  public.convert_lead(uuid, uuid), public.renew_contract(uuid, date, date, numeric, numeric),
  public.add_installments(uuid, numeric, int, date, interval, text), public.create_rent_schedule(uuid),
  public.property_open_deals(uuid), public.normalize_mobile(text)
  to authenticated;
-- Needed inside RLS policies evaluated for visitors.
grant execute on function public.is_listing_public(uuid), public.has_permission(text) to anon;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Reference lists
do $$
declare t text;
begin
  foreach t in array array['currencies', 'area_units', 'property_categories', 'property_types', 'features',
                           'availability_statuses', 'lead_sources', 'party_categories', 'lead_statuses',
                           'transaction_statuses', 'contract_types', 'contract_statuses',
                           'contract_status_transitions', 'reminder_rules']
  loop
    execute format('create policy "Readable by everyone" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "Managed by administrators" on public.%I for all to authenticated
                    using ((select public.has_permission(''settings.manage''))) with check ((select public.has_permission(''settings.manage'')))', t);
  end loop;
end;
$$;

create policy "Public settings are readable" on public.settings for select to anon, authenticated
  using (is_public or (select public.is_staff()));
create policy "Managed by administrators" on public.settings for all to authenticated
  using ((select public.has_permission('settings.manage'))) with check ((select public.has_permission('settings.manage')));

-- Staff, roles, permissions
create policy "Staff can read roles" on public.roles for select to authenticated using ((select public.is_staff()));
create policy "Staff can read permissions" on public.permissions for select to authenticated using ((select public.is_staff()));
create policy "Staff can read role permissions" on public.role_permissions for select to authenticated using ((select public.is_staff()));
create policy "User managers edit role permissions" on public.role_permissions for all to authenticated
  using ((select public.has_permission('users.manage'))) with check ((select public.has_permission('users.manage')));

create policy "Staff directory" on public.staff for select to authenticated
  using ((select public.is_staff()) or id = (select auth.uid()));
create policy "User managers manage staff" on public.staff for all to authenticated
  using ((select public.has_permission('users.manage'))) with check ((select public.has_permission('users.manage')));

create policy "See own and managed grants" on public.staff_permissions for select to authenticated
  using (staff_id = (select auth.uid()) or (select public.has_permission('users.manage')));
create policy "User managers grant permissions" on public.staff_permissions for all to authenticated
  using ((select public.has_permission('users.manage'))) with check ((select public.has_permission('users.manage')));

-- Properties
create policy "Visitors see published listings" on public.properties for select to anon
  using (publication = 'published' and exists (
    select 1 from public.availability_statuses a where a.slug = availability and a.show_on_site));
create policy "Staff see permitted properties" on public.properties for select to authenticated
  using ((select public.has_permission('properties.view'))
         or ((select public.has_permission('properties.view_assigned')) and agent_id = (select auth.uid())));
create policy "Property editors create" on public.properties for insert to authenticated
  with check ((select public.has_permission('properties.edit')));
create policy "Property editors update" on public.properties for update to authenticated
  using ((select public.has_permission('properties.edit')) or (select public.has_permission('properties.publish'))
         or (select public.has_permission('properties.archive')))
  with check (true);
create policy "Permitted staff delete" on public.properties for delete to authenticated
  using ((select public.has_permission('properties.delete')));

create policy "Visitors see features of published listings" on public.property_features for select to anon
  using (public.is_listing_public(property_id));
create policy "Staff see features" on public.property_features for select to authenticated
  using ((select public.is_staff()));
create policy "Property editors manage features" on public.property_features for all to authenticated
  using ((select public.has_permission('properties.edit'))) with check ((select public.has_permission('properties.edit')));

create policy "Visitors see public photos and videos" on public.property_media for select to anon
  using (is_public and kind in ('image', 'video') and public.is_listing_public(property_id));
create policy "Staff see media" on public.property_media for select to authenticated
  using ((select public.has_permission('properties.view')) or (select public.has_permission('properties.view_assigned')));
create policy "Property editors manage media" on public.property_media for all to authenticated
  using ((select public.has_permission('properties.edit'))) with check ((select public.has_permission('properties.edit')));

create policy "History for property and audit viewers" on public.property_history for select to authenticated
  using ((select public.has_permission('properties.view')) or (select public.has_permission('audit.view')));

-- Customers
create policy "Customer viewers" on public.customers for select to authenticated
  using ((select public.has_permission('customers.view')));
create policy "Customer editors create" on public.customers for insert to authenticated
  with check ((select public.has_permission('customers.edit')));
create policy "Customer editors update" on public.customers for update to authenticated
  using ((select public.has_permission('customers.edit'))) with check (true);
create policy "Record deleters" on public.customers for delete to authenticated
  using ((select public.has_permission('records.delete')));

create policy "Customer viewers" on public.customer_categories for select to authenticated
  using ((select public.has_permission('customers.view')));
create policy "Customer editors" on public.customer_categories for all to authenticated
  using ((select public.has_permission('customers.edit'))) with check ((select public.has_permission('customers.edit')));

-- Leads: everyone with leads.view_all, or agents for their own (BRD §3.4)
create or replace function public.can_see_lead(p_assigned uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('leads.view_all')
      or (public.has_permission('leads.view_assigned') and p_assigned = auth.uid());
$$;
grant execute on function public.can_see_lead(uuid) to authenticated;

create policy "Permitted lead viewers" on public.leads for select to authenticated
  using ((select public.can_see_lead(assigned_to)));
create policy "Lead editors create" on public.leads for insert to authenticated
  with check ((select public.has_permission('leads.edit')));
create policy "Lead editors update visible leads" on public.leads for update to authenticated
  using ((select public.has_permission('leads.edit') or public.has_permission('leads.assign')) and public.can_see_lead(assigned_to))
  with check (true);
create policy "Record deleters" on public.leads for delete to authenticated
  using ((select public.has_permission('records.delete')));

create policy "Activity viewers" on public.activities for select to authenticated
  using (assigned_to = (select auth.uid()) or created_by = (select auth.uid())
         or (select public.has_permission('leads.view_all')) or (select public.has_permission('customers.view')));
create policy "Lead editors log activities" on public.activities for insert to authenticated
  with check ((select public.has_permission('leads.edit')) or (select public.has_permission('customers.edit')));
create policy "Owners and managers update activities" on public.activities for update to authenticated
  using (assigned_to = (select auth.uid()) or created_by = (select auth.uid()) or (select public.has_permission('leads.assign')))
  with check (true);
create policy "Owners delete own notes" on public.activities for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.has_permission('records.delete')));

-- Transactions
create policy "Transaction viewers" on public.transactions for select to authenticated
  using ((select public.has_permission('transactions.view'))
         or ((select public.has_permission('transactions.view_own')) and agent_id = (select auth.uid())));
create policy "Transaction editors create" on public.transactions for insert to authenticated
  with check ((select public.has_permission('transactions.edit')));
create policy "Transaction editors and approvers update" on public.transactions for update to authenticated
  using (((select public.has_permission('transactions.edit'))
          and ((select public.has_permission('transactions.view')) or agent_id = (select auth.uid())))
         or (select public.has_permission('transactions.approve'))
         or (select public.has_permission('transactions.cancel')))
  with check (true);
create policy "Record deleters" on public.transactions for delete to authenticated
  using ((select public.has_permission('records.delete')));

create policy "Transaction viewers" on public.transaction_parties for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id));
create policy "Transaction editors" on public.transaction_parties for all to authenticated
  using ((select public.has_permission('transactions.edit')) and exists (select 1 from public.transactions t where t.id = transaction_id))
  with check ((select public.has_permission('transactions.edit')));

-- Contracts
create policy "Contract viewers" on public.contracts for select to authenticated
  using ((select public.has_permission('contracts.view'))
         or ((select public.has_permission('contracts.view_own')) and (
              responsible_id = (select auth.uid())
              or exists (select 1 from public.transactions t where t.id = transaction_id and t.agent_id = (select auth.uid())))));
create policy "Contract editors create" on public.contracts for insert to authenticated
  with check ((select public.has_permission('contracts.edit')));
create policy "Contract editors update" on public.contracts for update to authenticated
  using ((select public.has_permission('contracts.edit')) or (select public.has_permission('contracts.cancel')))
  with check (true);
create policy "Record deleters" on public.contracts for delete to authenticated
  using ((select public.has_permission('records.delete')) and status in ('draft', 'cancelled'));

create policy "Contract viewers" on public.contract_parties for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id));
create policy "Contract editors" on public.contract_parties for all to authenticated
  using ((select public.has_permission('contracts.edit'))) with check ((select public.has_permission('contracts.edit')));

create policy "Contract viewers" on public.contract_documents for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id));
create policy "Contract editors upload" on public.contract_documents for insert to authenticated
  with check ((select public.has_permission('contracts.edit')));
create policy "Contract editors annotate" on public.contract_documents for update to authenticated
  using ((select public.has_permission('contracts.edit'))) with check (true);
create policy "Record deleters" on public.contract_documents for delete to authenticated
  using ((select public.has_permission('records.delete')));

-- Payments
create policy "Payment viewers" on public.payment_schedules for select to authenticated
  using ((select public.has_permission('payments.view')));
create policy "Payment recorders create" on public.payment_schedules for insert to authenticated
  with check ((select public.has_permission('payments.record')));
create policy "Payment recorders update" on public.payment_schedules for update to authenticated
  using ((select public.has_permission('payments.record'))) with check (true);
create policy "Record deleters" on public.payment_schedules for delete to authenticated
  using ((select public.has_permission('records.delete'))
         and not exists (select 1 from public.payments p where p.schedule_id = payment_schedules.id));

create policy "Payment viewers" on public.installments for select to authenticated
  using ((select public.has_permission('payments.view')));
create policy "Payment recorders manage unpaid installments" on public.installments for all to authenticated
  using ((select public.has_permission('payments.record'))
         and not exists (select 1 from public.payments p where p.installment_id = installments.id and p.voided_at is null))
  with check ((select public.has_permission('payments.record')));

create policy "Payment viewers" on public.payments for select to authenticated
  using ((select public.has_permission('payments.view')));
create policy "Payment recorders" on public.payments for insert to authenticated
  with check ((select public.has_permission('payments.record')));
create policy "Adjusters void and recorders annotate" on public.payments for update to authenticated
  using ((select public.has_permission('payments.adjust')) or (select public.has_permission('payments.record')))
  with check (true);

-- Notifications: each person sees their own
create policy "Own notifications" on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "Mark own as read" on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create policy "Audit viewers" on public.audit_log for select to authenticated
  using ((select public.has_permission('audit.view')));

-- ---------------------------------------------------------------------------
-- Storage buckets
--   property-media  public  listing photos (paths are random UUIDs)
--   documents       private property documents and contracts
--   submissions     private photos sent with the Sell Your Property form
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('property-media', 'property-media', true,  10485760, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  ('documents',      'documents',      false, 26214400, array['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png']),
  ('submissions',    'submissions',    false, 8388608,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Property editors upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-media' and (select public.has_permission('properties.edit')));
create policy "Property editors change media" on storage.objects for update to authenticated
  using (bucket_id = 'property-media' and (select public.has_permission('properties.edit')));
create policy "Property editors remove media" on storage.objects for delete to authenticated
  using (bucket_id = 'property-media' and (select public.has_permission('properties.edit')));

-- documents/properties/<property id>/...   documents/contracts/<contract id>/...
create policy "Staff read permitted documents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (
    ((storage.foldername(name))[1] = 'properties' and (select public.has_permission('properties.view')))
    or ((storage.foldername(name))[1] = 'contracts' and exists (
          select 1 from public.contract_documents d where d.storage_path = objects.name))));
create policy "Staff upload documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (
    ((storage.foldername(name))[1] = 'properties' and (select public.has_permission('properties.edit')))
    or ((storage.foldername(name))[1] = 'contracts' and (select public.has_permission('contracts.edit')))));
create policy "Record deleters remove documents" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select public.has_permission('records.delete')));

create policy "Visitors attach photos to submissions" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = 'sell');
create policy "Lead viewers read submissions" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (select public.has_permission('leads.view_all')));
