-- Set the business WhatsApp number used by the website's WhatsApp links and floating chat button.
update public.settings
set value = jsonb_set(value, '{whatsapp}', '"+92 302 8600631"')
where key = 'business';
