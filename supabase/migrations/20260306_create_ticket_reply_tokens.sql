-- Secure reporter reply links for anonymous two-way communication.
-- Idempotent migration.

CREATE TABLE IF NOT EXISTS public.ticket_reply_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  token text NOT NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_reply_tokens
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS ticket_id uuid,
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_reply_tokens_token_not_empty_chk'
      AND conrelid = 'public.ticket_reply_tokens'::regclass
  ) THEN
    ALTER TABLE public.ticket_reply_tokens
      ADD CONSTRAINT ticket_reply_tokens_token_not_empty_chk
      CHECK (length(btrim(token)) >= 32);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_reply_tokens_token_unique
  ON public.ticket_reply_tokens (token);

CREATE INDEX IF NOT EXISTS idx_ticket_reply_tokens_ticket_id
  ON public.ticket_reply_tokens (ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_reply_tokens_expires_at
  ON public.ticket_reply_tokens (expires_at);

ALTER TABLE public.ticket_reply_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_reply_tokens_no_direct_select ON public.ticket_reply_tokens;
CREATE POLICY ticket_reply_tokens_no_direct_select
  ON public.ticket_reply_tokens
  FOR SELECT
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ticket_reply_tokens_no_direct_write ON public.ticket_reply_tokens;
CREATE POLICY ticket_reply_tokens_no_direct_write
  ON public.ticket_reply_tokens
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.ticket_reply_tokens IS 'Secure one-time style reply links for reporter communication';
COMMENT ON COLUMN public.ticket_reply_tokens.token IS 'Opaque random token shown only in secure URL';
