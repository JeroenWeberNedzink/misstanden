-- Capture current RLS policies and table grants to reduce DB drift.
-- This is non-breaking and can be used for audit/review before hardening.

CREATE TABLE IF NOT EXISTS public.security_policy_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_tag TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schemaname TEXT NOT NULL,
  tablename TEXT NOT NULL,
  policyname TEXT NOT NULL,
  permissive TEXT NOT NULL,
  roles TEXT[] NOT NULL,
  cmd TEXT NOT NULL,
  qual TEXT NULL,
  with_check TEXT NULL
);

CREATE TABLE IF NOT EXISTS public.security_grant_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_tag TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  table_schema TEXT NOT NULL,
  table_name TEXT NOT NULL,
  grantee TEXT NOT NULL,
  privilege_type TEXT NOT NULL,
  is_grantable TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_security_policy_snapshots_tag
  ON public.security_policy_snapshots (snapshot_tag);

CREATE INDEX IF NOT EXISTS idx_security_grant_snapshots_tag
  ON public.security_grant_snapshots (snapshot_tag);

INSERT INTO public.security_policy_snapshots (
  snapshot_tag,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
)
SELECT
  '20260219_pre_hardening',
  p.schemaname,
  p.tablename,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual,
  p.with_check
FROM pg_policies p
WHERE p.schemaname = 'public';

INSERT INTO public.security_grant_snapshots (
  snapshot_tag,
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
)
SELECT
  '20260219_pre_hardening',
  g.table_schema,
  g.table_name,
  g.grantee,
  g.privilege_type,
  g.is_grantable
FROM information_schema.role_table_grants g
WHERE g.table_schema = 'public';
