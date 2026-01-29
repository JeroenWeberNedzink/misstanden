-- Add handler information to messages table
-- This allows us to track which specific handler sent a message

-- Step 1: Add handler_id and handler_name columns
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS handler_id UUID REFERENCES handlers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS handler_name TEXT;

-- Step 2: Add index for performance
CREATE INDEX IF NOT EXISTS idx_messages_handler_id ON messages(handler_id);

-- Step 3: Update existing messages to populate handler_name from ticket_actions
-- (Best effort - matches messages to actions by ticket_id and timestamp proximity)
UPDATE messages m
SET handler_name = ta.handler_name,
    handler_id = ta.handler_id
FROM ticket_actions ta
WHERE m.ticket_id = ta.ticket_id
  AND ta.action_type = 'message_sent'
  AND m.sender = 'handler'
  AND ABS(EXTRACT(EPOCH FROM (m.created_at - ta.created_at))) < 5
  AND m.handler_name IS NULL;

-- Step 4: Add comment
COMMENT ON COLUMN messages.handler_id IS 'The handler who sent this message (if sender=handler)';
COMMENT ON COLUMN messages.handler_name IS 'The name of the handler who sent this message (denormalized for performance)';
