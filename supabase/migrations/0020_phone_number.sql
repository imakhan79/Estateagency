-- Set the business phone number shown in the header, footer, Contact page and property pages.
update public.settings
set value = jsonb_set(value, '{phone}', '"+92 302 8600631"')
where key = 'business';
