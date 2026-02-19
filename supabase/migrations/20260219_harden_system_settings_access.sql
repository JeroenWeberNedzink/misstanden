-- Phase 1 hardening:
-- Move system_settings access behind server-side API (service role),
-- and remove direct browser-role access (anon/authenticated).

ALTER TABLE IF EXISTS public.system_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_settings', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.system_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.system_settings FROM anon;
REVOKE ALL ON TABLE public.system_settings FROM authenticated;
GRANT ALL ON TABLE public.system_settings TO service_role;

CREATE POLICY system_settings_service_role_all
ON public.system_settings
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
