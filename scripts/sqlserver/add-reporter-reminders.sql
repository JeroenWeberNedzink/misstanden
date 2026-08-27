IF OBJECT_ID(N'dbo.reporter_reminder_deliveries', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.reporter_reminder_deliveries (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_reporter_reminder_deliveries PRIMARY KEY DEFAULT NEWID(),
        ticket_id UNIQUEIDENTIFIER NOT NULL,
        reminder_type NVARCHAR(50) NOT NULL,
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_reporter_reminder_deliveries_status DEFAULT N'processing',
        attempt_count INT NOT NULL CONSTRAINT DF_reporter_reminder_deliveries_attempt_count DEFAULT (1),
        last_attempt_at DATETIME2(3) NOT NULL CONSTRAINT DF_reporter_reminder_deliveries_last_attempt_at DEFAULT SYSUTCDATETIME(),
        sent_at DATETIME2(3) NULL,
        next_attempt_at DATETIME2(3) NULL,
        last_error NVARCHAR(1000) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_reporter_reminder_deliveries_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_reporter_reminder_deliveries_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_reporter_reminder_deliveries_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE,
        CONSTRAINT CK_reporter_reminder_deliveries_type CHECK (reminder_type IN (N'follow_up', N'unassigned')),
        CONSTRAINT CK_reporter_reminder_deliveries_status CHECK (status IN (N'processing', N'sent', N'failed'))
    );
    CREATE UNIQUE INDEX UX_reporter_reminder_ticket_type ON dbo.reporter_reminder_deliveries(ticket_id, reminder_type);
    CREATE INDEX IX_reporter_reminder_due ON dbo.reporter_reminder_deliveries(status, next_attempt_at) INCLUDE (ticket_id, reminder_type);
END;
