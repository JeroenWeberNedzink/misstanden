-- Support multiple handlers per ticket while keeping tickets.handler_id as primary assignee.
CREATE TABLE IF NOT EXISTS ticket_handlers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  handler_id UUID NOT NULL REFERENCES handlers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, handler_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_handlers_ticket_id
  ON ticket_handlers(ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_handlers_handler_id
  ON ticket_handlers(handler_id);

COMMENT ON TABLE ticket_handlers IS 'Many-to-many handler assignments for collaborative case handling.';
COMMENT ON COLUMN ticket_handlers.ticket_id IS 'Linked ticket.';
COMMENT ON COLUMN ticket_handlers.handler_id IS 'Linked handler assigned to this ticket.';

