-- Restore read access needed by the current frontend runtime.
-- Context:
-- The write-hardening migration can remove FOR ALL policies that implicitly
-- granted SELECT. This migration re-adds explicit SELECT policies.

-- Workflows: public report form must be able to read active workflows.
ALTER TABLE IF EXISTS public.workflows ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.workflows TO anon, authenticated;

DROP POLICY IF EXISTS workflows_anon_read_active ON public.workflows;
DROP POLICY IF EXISTS workflows_authenticated_read_all ON public.workflows;

CREATE POLICY workflows_anon_read_active
ON public.workflows
AS PERMISSIVE
FOR SELECT
TO anon
USING (active = true);

CREATE POLICY workflows_authenticated_read_all
ON public.workflows
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- Workflow statuses: report form/ticket creation needs statuses for active workflows.
ALTER TABLE IF EXISTS public.workflow_statuses ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.workflow_statuses TO anon, authenticated;

DROP POLICY IF EXISTS workflow_statuses_anon_read_active_workflows ON public.workflow_statuses;
DROP POLICY IF EXISTS workflow_statuses_authenticated_read_all ON public.workflow_statuses;

CREATE POLICY workflow_statuses_anon_read_active_workflows
ON public.workflow_statuses
AS PERMISSIVE
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.workflows w
    WHERE w.id = workflow_statuses.workflow_id
      AND w.active = true
  )
);

CREATE POLICY workflow_statuses_authenticated_read_all
ON public.workflow_statuses
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

