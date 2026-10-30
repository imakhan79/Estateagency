-- Rebrand the default business name to Rehman Enterprises.
-- Only touches the name if it was never customised in Settings.
update public.settings
set value = jsonb_set(value, '{name}', '"Rehman Enterprises"')
where key = 'business' and value->>'name' = 'Crescent Realty';
