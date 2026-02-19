-- Phase 2 hardening:
-- Remove direct browser-role writes on workflow configuration tables.
-- Frontend mutations now go through backend APIs using service role.

DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['workflows', 'workflow_statuses', 'handler_workflows']
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
        AND (roles && ARRAY['public'::name, 'anon'::name, 'authenticated'::name]::name[])
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM PUBLIC', tbl);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon', tbl);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM authenticated', tbl);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_service_role_all', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl || '_service_role_all',
      tbl
    );
  END LOOP;
END $$;

