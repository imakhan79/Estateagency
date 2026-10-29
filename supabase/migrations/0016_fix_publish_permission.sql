-- 0016: staff could not publish listings. The publication trigger calls settings_bool(), which lost its
-- EXECUTE grant when 0006 revoked function access by default. Found by scripts/test-workflows.mjs.
grant execute on function public.settings_bool(text) to authenticated;
