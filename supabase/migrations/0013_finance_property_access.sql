-- 0013: finance needs property references for receipts and schedules (BRD §10.8).
-- Without properties.view the receipt view's property join filtered out every allocation.
insert into public.role_permissions (role, permission) values ('finance', 'properties.view')
on conflict do nothing;
