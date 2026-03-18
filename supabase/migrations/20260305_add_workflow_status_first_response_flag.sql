-- Add explicit workflow-status marker for "first reaction" SLA milestone.
-- Idempotent migration.

ALTER TABLE IF EXISTS public.workflow_statuses
  ADD COLUMN IF NOT EXISTS is_first_response boolean NOT NULL DEFAULT false;
