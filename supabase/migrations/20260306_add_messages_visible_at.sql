-- Delay handler-message visibility to reporters to reduce identity timing leakage.
-- Existing table name in this project is public.messages.
-- Idempotent migration.

ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS visible_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_messages_ticket_visible_at
  ON public.messages (ticket_id, visible_at);

