SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.workflow_statuses', N'automatic_reply') IS NULL
BEGIN
    ALTER TABLE dbo.workflow_statuses ADD automatic_reply NVARCHAR(MAX) NULL;
END;
GO

DECLARE @receipt NVARCHAR(MAX) =
    N'We hebben jouw melding in goede orde ontvangen. Wij zullen je binnen 7 dagen informeren of en hoe we deze melding gaan behandelen.';
DECLARE @admissible NVARCHAR(MAX) =
    N'We zijn van mening dat deze melding verder onderzoek rechtvaardigt, hiervoor nemen we maximaal 56 dagen (8 weken) de tijd.';
DECLARE @not_admissible NVARCHAR(MAX) =
    N'Na een zorgvuldige afweging is de onderzoekscommissie tot het besluit gekomen dat de aard van jouw melding verder onderzoek niet rechtvaardigt. Wij gaan dus over tot sluiten van het dossier en wij wijzen je nog op het recht deze melding extern in te dienen.';

DECLARE @whistleblower_id UNIQUEIDENTIFIER =
    (SELECT TOP 1 id FROM dbo.workflows WHERE code = N'whistleblower');
DECLARE @conduct_id UNIQUEIDENTIFIER =
    (SELECT TOP 1 id FROM dbo.workflows WHERE code = N'omgangsvormen');

IF @whistleblower_id IS NOT NULL
BEGIN
    UPDATE dbo.workflow_statuses
    SET automatic_reply = @receipt, updated_at = SYSUTCDATETIME()
    WHERE workflow_id = @whistleblower_id AND code = N'acknowledged';

    UPDATE dbo.workflow_statuses
    SET automatic_reply = @admissible,
        expected_duration_days = 56,
        updated_at = SYSUTCDATETIME()
    WHERE workflow_id = @whistleblower_id AND code = N'investigation';

    IF NOT EXISTS (
        SELECT 1 FROM dbo.workflow_statuses
        WHERE workflow_id = @whistleblower_id AND code = N'not_admissible'
    )
    BEGIN
        INSERT INTO dbo.workflow_statuses (
            id, workflow_id, code, label, description, sort_order, is_terminal,
            is_first_response, next_codes, expected_duration_days, automatic_reply,
            created_at, updated_at
        )
        VALUES (
            NEWID(), @whistleblower_id, N'not_admissible', N'Niet ontvankelijk',
            N'De melding rechtvaardigt geen verder onderzoek; het dossier wordt gesloten.',
            45, 1, 0, N'[]', NULL, @not_admissible, SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    END
    ELSE
    BEGIN
        UPDATE dbo.workflow_statuses
        SET label = N'Niet ontvankelijk',
            description = N'De melding rechtvaardigt geen verder onderzoek; het dossier wordt gesloten.',
            is_terminal = 1,
            next_codes = N'[]',
            automatic_reply = @not_admissible,
            updated_at = SYSUTCDATETIME()
        WHERE workflow_id = @whistleblower_id AND code = N'not_admissible';
    END;

    UPDATE dbo.workflow_statuses
    SET next_codes = N'["investigation","not_admissible"]',
        updated_at = SYSUTCDATETIME()
    WHERE workflow_id = @whistleblower_id AND code = N'assessment';
END;

IF @conduct_id IS NOT NULL
BEGIN
    UPDATE dbo.workflow_statuses
    SET automatic_reply = @receipt, updated_at = SYSUTCDATETIME()
    WHERE workflow_id = @conduct_id AND code = N'resolved';

    UPDATE dbo.workflow_statuses
    SET automatic_reply = @admissible,
        expected_duration_days = 56,
        updated_at = SYSUTCDATETIME()
    WHERE workflow_id = @conduct_id AND code = N'closed';

    IF NOT EXISTS (
        SELECT 1 FROM dbo.workflow_statuses
        WHERE workflow_id = @conduct_id AND code = N'not_admissible'
    )
    BEGIN
        INSERT INTO dbo.workflow_statuses (
            id, workflow_id, code, label, description, sort_order, is_terminal,
            is_first_response, next_codes, expected_duration_days, automatic_reply,
            created_at, updated_at
        )
        VALUES (
            NEWID(), @conduct_id, N'not_admissible', N'Niet ontvankelijk',
            N'De melding rechtvaardigt geen verder onderzoek; het dossier wordt gesloten.',
            35, 1, 0, N'[]', NULL, @not_admissible, SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    END
    ELSE
    BEGIN
        UPDATE dbo.workflow_statuses
        SET label = N'Niet ontvankelijk',
            description = N'De melding rechtvaardigt geen verder onderzoek; het dossier wordt gesloten.',
            is_terminal = 1,
            next_codes = N'[]',
            automatic_reply = @not_admissible,
            updated_at = SYSUTCDATETIME()
        WHERE workflow_id = @conduct_id AND code = N'not_admissible';
    END;

    UPDATE dbo.workflow_statuses
    SET next_codes = N'["closed","not_admissible"]',
        updated_at = SYSUTCDATETIME()
    WHERE workflow_id = @conduct_id AND code = N'in_progress';
END;

COMMIT TRANSACTION;
