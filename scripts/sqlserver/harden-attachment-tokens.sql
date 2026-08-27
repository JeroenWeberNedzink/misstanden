IF COL_LENGTH(N'dbo.tickets', N'access_code_hash') IS NULL
BEGIN
    ALTER TABLE dbo.tickets ADD access_code_hash NVARCHAR(64) NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.tickets') AND name = N'IX_tickets_access_code_hash')
BEGIN
    EXEC(N'CREATE INDEX IX_tickets_access_code_hash ON dbo.tickets(access_code_hash) WHERE access_code_hash IS NOT NULL');
END;

IF COL_LENGTH(N'dbo.ticket_reply_tokens', N'token_hash') IS NULL
BEGIN
    ALTER TABLE dbo.ticket_reply_tokens ADD token_hash NVARCHAR(64) NULL;
END;
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.ticket_reply_tokens') AND name = N'token' AND is_nullable = 0
)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ticket_reply_tokens') AND name = N'UX_ticket_reply_tokens_token')
    BEGIN
        DROP INDEX UX_ticket_reply_tokens_token ON dbo.ticket_reply_tokens;
    END;
    ALTER TABLE dbo.ticket_reply_tokens ALTER COLUMN token NVARCHAR(255) NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ticket_reply_tokens') AND name = N'UX_ticket_reply_tokens_token')
BEGIN
    EXEC(N'CREATE UNIQUE INDEX UX_ticket_reply_tokens_token ON dbo.ticket_reply_tokens(token) WHERE token IS NOT NULL');
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ticket_reply_tokens') AND name = N'UX_ticket_reply_tokens_token_hash')
BEGIN
    EXEC(N'CREATE UNIQUE INDEX UX_ticket_reply_tokens_token_hash ON dbo.ticket_reply_tokens(token_hash) WHERE token_hash IS NOT NULL');
END;
