MERGE dbo.roles AS target
USING (VALUES
    (N'USER', N'Gebruiker', N'Basisgebruiker zonder beheertoegang', 1, 0),
    (N'HANDLER', N'Behandelaar', N'Kan meldingen bekijken en behandelen', 1, 1),
    (N'ADMIN', N'Administrator', N'Kan gebruikers, workflows en instellingen beheren', 1, 0),
    (N'SUPER_ADMIN', N'Super Admin', N'Volledige beheerrechten op het portaal', 1, 0)
) AS source (code, name, description, is_system, is_default)
ON target.code = source.code
WHEN MATCHED THEN
    UPDATE SET
        name = source.name,
        description = source.description,
        is_system = source.is_system,
        is_default = source.is_default,
        updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (id, code, name, description, is_system, is_default, created_at, updated_at)
    VALUES (NEWID(), source.code, source.name, source.description, source.is_system, source.is_default, SYSUTCDATETIME(), SYSUTCDATETIME());

MERGE dbo.permissions AS target
USING (VALUES
    (N'canViewTickets', N'Tickets bekijken', N'Kan meldingen en tickets bekijken', N'tickets', 1),
    (N'canEditTickets', N'Tickets bewerken', N'Kan tickets behandelen en bijwerken', N'tickets', 1),
    (N'canDeleteTickets', N'Tickets verwijderen', N'Kan tickets verwijderen', N'tickets', 1),
    (N'canManageUsers', N'Gebruikers beheren', N'Kan gebruikers en handlers beheren', N'admin', 1),
    (N'canExportData', N'Data exporteren', N'Kan data exporteren', N'admin', 1),
    (N'canManageWorkflows', N'Workflows beheren', N'Kan workflows en statussen beheren', N'admin', 1),
    (N'admin', N'Admin toegang', N'Legacy admin permissie voor server-side autorisatie', N'legacy', 1),
    (N'manage_users', N'Users beheren', N'Legacy permissie voor gebruikersbeheer', N'legacy', 1),
    (N'manage_workflows', N'Workflows beheren', N'Legacy permissie voor workflowbeheer', N'legacy', 1),
    (N'manage_settings', N'Instellingen beheren', N'Legacy permissie voor instellingenbeheer', N'legacy', 1),
    (N'manage_translations', N'Translations beheren', N'Legacy permissie voor vertalingsbeheer', N'legacy', 1)
) AS source (code, name, description, category, is_system)
ON target.code = source.code
WHEN MATCHED THEN
    UPDATE SET
        name = source.name,
        description = source.description,
        category = source.category,
        is_system = source.is_system,
        updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (id, code, name, description, category, is_system, created_at, updated_at)
    VALUES (NEWID(), source.code, source.name, source.description, source.category, source.is_system, SYSUTCDATETIME(), SYSUTCDATETIME());

;WITH role_permission_source AS (
    SELECT source.role_code, source.permission_code
    FROM (VALUES
        (N'HANDLER', N'canViewTickets'),
        (N'HANDLER', N'canEditTickets'),
        (N'ADMIN', N'canViewTickets'),
        (N'ADMIN', N'canEditTickets'),
        (N'ADMIN', N'canDeleteTickets'),
        (N'ADMIN', N'canManageUsers'),
        (N'ADMIN', N'canExportData'),
        (N'ADMIN', N'canManageWorkflows'),
        (N'ADMIN', N'admin'),
        (N'ADMIN', N'manage_users'),
        (N'ADMIN', N'manage_workflows'),
        (N'ADMIN', N'manage_settings'),
        (N'ADMIN', N'manage_translations'),
        (N'SUPER_ADMIN', N'canViewTickets'),
        (N'SUPER_ADMIN', N'canEditTickets'),
        (N'SUPER_ADMIN', N'canDeleteTickets'),
        (N'SUPER_ADMIN', N'canManageUsers'),
        (N'SUPER_ADMIN', N'canExportData'),
        (N'SUPER_ADMIN', N'canManageWorkflows'),
        (N'SUPER_ADMIN', N'admin'),
        (N'SUPER_ADMIN', N'manage_users'),
        (N'SUPER_ADMIN', N'manage_workflows'),
        (N'SUPER_ADMIN', N'manage_settings'),
        (N'SUPER_ADMIN', N'manage_translations')
    ) AS source (role_code, permission_code)
),
resolved_role_permissions AS (
    SELECT
        r.id AS role_id,
        p.id AS permission_id
    FROM role_permission_source source
    INNER JOIN dbo.roles r
        ON r.code = source.role_code
    INNER JOIN dbo.permissions p
        ON p.code = source.permission_code
)
MERGE dbo.role_permissions AS target
USING resolved_role_permissions AS source
ON target.role_id = source.role_id AND target.permission_id = source.permission_id
WHEN NOT MATCHED THEN
    INSERT (id, role_id, permission_id, created_at)
    VALUES (NEWID(), source.role_id, source.permission_id, SYSUTCDATETIME());

MERGE dbo.locations AS target
USING (VALUES
    (N'NL', N'Nederland', 1, 1),
    (N'GB', N'United Kingdom', 2, 1),
    (N'FR', N'France', 3, 1),
    (N'DE', N'Deutschland', 4, 1)
) AS source (country_code, country_name, display_order, active)
ON target.country_code = source.country_code
WHEN MATCHED THEN
    UPDATE SET
        country_name = source.country_name,
        display_order = source.display_order,
        active = source.active,
        updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (id, country_code, country_name, display_order, active, created_at, updated_at)
    VALUES (NEWID(), source.country_code, source.country_name, source.display_order, source.active, SYSUTCDATETIME(), SYSUTCDATETIME());

MERGE dbo.system_settings AS target
USING (VALUES
    (N'portal.name', N'portal.name', N'{"value":"Misstanden Portal"}', N'general', N'Naam van de portal zoals weergegeven in de UI', 0),
    (N'portal.tagline', N'portal.tagline', N'{"value":"Meld en los misstanden op"}', N'general', N'Tagline weergegeven op de login pagina', 0),
    (N'portal.support_email', N'portal.support_email', N'{"value":"support@example.com"}', N'general', N'Support email adres voor gebruikers', 0),
    (N'portal.support_phone', N'portal.support_phone', N'{"value":""}', N'general', N'Support telefoonnummer (optioneel)', 0),
    (N'portal.timezone', N'portal.timezone', N'{"value":"Europe/Amsterdam"}', N'general', N'Tijdzone voor de portal', 0),
    (N'portal.language', N'portal.language', N'{"value":"nl"}', N'general', N'Standaard taal', 0),
    (N'portal.enable_registration', N'portal.enable_registration', N'{"value":false}', N'portal', N'Sta nieuwe gebruikers toe om zichzelf te registreren', 0),
    (N'portal.enable_public_submissions', N'portal.enable_public_submissions', N'{"value":true}', N'portal', N'Sta anonieme meldingen toe zonder login', 0),
    (N'portal.enable_attachments', N'portal.enable_attachments', N'{"value":true}', N'portal', N'Sta gebruikers toe om bestanden te uploaden', 0),
    (N'portal.max_attachment_size_mb', N'portal.max_attachment_size_mb', N'{"value":10}', N'portal', N'Maximum bestandsgrootte in MB', 0),
    (N'portal.allowed_file_types', N'portal.allowed_file_types', N'{"value":["pdf","jpg","jpeg","png","doc","docx"]}', N'portal', N'Toegestane bestandstypen', 0),
    (N'workflow.auto_assign', N'workflow.auto_assign', N'{"value":true}', N'workflow', N'Automatisch tickets toewijzen aan handlers', 0),
    (N'workflow.allow_status_rollback', N'workflow.allow_status_rollback', N'{"value":false}', N'workflow', N'Sta handlers toe om status terug te zetten', 0),
    (N'workflow.require_comment_on_status_change', N'workflow.require_comment_on_status_change', N'{"value":true}', N'workflow', N'Verplicht commentaar bij statuswijziging', 0),
    (N'workflow.notify_on_assignment', N'workflow.notify_on_assignment', N'{"value":true}', N'workflow', N'Stuur notificatie bij toewijzing van ticket', 0),
    (N'sla.enable', N'sla.enable', N'{"value":true}', N'sla', N'Schakel SLA monitoring in', 0),
    (N'sla.default_response_hours', N'sla.default_response_hours', N'{"value":24}', N'sla', N'Standaard responstijd in uren', 0),
    (N'sla.default_resolution_hours', N'sla.default_resolution_hours', N'{"value":72}', N'sla', N'Standaard oplostijd in uren', 0),
    (N'sla.warning_threshold_percent', N'sla.warning_threshold_percent', N'{"value":75}', N'sla', N'Waarschuwing bij percentage van SLA tijd', 0),
    (N'sla.count_business_hours_only', N'sla.count_business_hours_only', N'{"value":true}', N'sla', N'Tel alleen werkuren', 0),
    (N'notifications.enable_email', N'notifications.enable_email', N'{"value":true}', N'notifications', N'Schakel email notificaties in', 0),
    (N'notifications.enable_in_app', N'notifications.enable_in_app', N'{"value":true}', N'notifications', N'Schakel in-app notificaties in', 0),
    (N'notifications.batch_digest', N'notifications.batch_digest', N'{"value":false}', N'notifications', N'Verzamel notificaties in dagelijkse digest', 0),
    (N'notifications.digest_time', N'notifications.digest_time', N'{"value":"09:00"}', N'notifications', N'Tijd voor dagelijkse digest', 0),
    (N'security.session_timeout_minutes', N'security.session_timeout_minutes', N'{"value":60}', N'security', N'Sessie timeout in minuten', 0),
    (N'security.require_2fa', N'security.require_2fa', N'{"value":false}', N'security', N'Verplicht 2FA voor alle gebruikers', 0),
    (N'security.api_rate_limit_per_minute', N'security.api_rate_limit_per_minute', N'{"value":60}', N'security', N'API rate limit per minuut per gebruiker', 0),
    (N'audit.enable_logging', N'audit.enable_logging', N'{"value":true}', N'audit', N'Schakel audit logging in', 0),
    (N'audit.log_read_operations', N'audit.log_read_operations', N'{"value":false}', N'audit', N'Log ook read operaties', 0),
    (N'audit.log_failed_logins', N'audit.log_failed_logins', N'{"value":true}', N'audit', N'Log mislukte login pogingen', 0),
    (N'audit.retention_days', N'audit.retention_days', N'{"value":365}', N'audit', N'Bewaar audit logs voor aantal dagen', 0),
    (N'retention.tickets_resolved_days', N'retention.tickets_resolved_days', N'{"value":730}', N'retention', N'Bewaar opgeloste tickets voor aantal dagen', 0),
    (N'retention.tickets_closed_days', N'retention.tickets_closed_days', N'{"value":1825}', N'retention', N'Bewaar gesloten tickets voor aantal dagen', 0),
    (N'retention.attachments_days', N'retention.attachments_days', N'{"value":730}', N'retention', N'Bewaar bijlagen voor aantal dagen', 0),
    (N'retention.comments_days', N'retention.comments_days', N'{"value":1825}', N'retention', N'Bewaar commentaren voor aantal dagen', 0),
    (N'retention.auto_cleanup_enabled', N'retention.auto_cleanup_enabled', N'{"value":false}', N'retention', N'Automatisch oude data opschonen', 0),
    (N'danger.enable_bulk_delete', N'danger.enable_bulk_delete', N'{"value":false}', N'danger', N'Sta bulk verwijderen toe', 0),
    (N'danger.enable_data_export', N'danger.enable_data_export', N'{"value":true}', N'danger', N'Sta data export toe', 0),
    (N'danger.maintenance_mode', N'danger.maintenance_mode', N'{"value":false}', N'danger', N'Onderhoudsmodus', 0),
    (N'danger.maintenance_message', N'danger.maintenance_message', N'{"value":"De portal is tijdelijk niet beschikbaar voor onderhoud. Probeer het later opnieuw."}', N'danger', N'Bericht tijdens onderhoudsmodus', 0),
    (N'tickets.allow_public_submission', N'tickets.allow_public_submission', N'{"value":true}', N'tickets', N'Publieke meldingen toestaan', 0),
    (N'tickets.auto_assign_enabled', N'tickets.auto_assign_enabled', N'{"value":true}', N'tickets', N'Automatisch toewijzen toestaan', 0),
    (N'tickets.default_priority', N'tickets.default_priority', N'{"value":"low"}', N'tickets', N'Standaard prioriteit voor nieuwe meldingen', 0),
    (N'tickets.require_email_verification', N'tickets.require_email_verification', N'{"value":true}', N'tickets', N'Verificatie van email vereisen', 0),
    (N'tickets.sla_response_time_hours', N'tickets.sla_response_time_hours', N'{"value":24}', N'tickets', N'Responstijd in uren', 0),
    (N'tickets.sla_resolution_time_hours', N'tickets.sla_resolution_time_hours', N'{"value":72}', N'tickets', N'Oplostijd in uren', 0),
    (N'tickets.ticket_number_prefix', N'tickets.ticket_number_prefix', N'{"value":"NZ"}', N'tickets', N'Prefix voor ticketnummers', 0),
    (N'compliance.anonymize_closed_tickets', N'compliance.anonymize_closed_tickets', N'{"value":false}', N'compliance', N'Anonimiseer gesloten tickets', 0),
    (N'compliance.audit_log_enabled', N'compliance.audit_log_enabled', N'{"value":true}', N'compliance', N'Audit logging actief', 0),
    (N'compliance.backup_frequency', N'compliance.backup_frequency', N'{"value":"weekly"}', N'compliance', N'Backup frequentie', 0),
    (N'compliance.data_retention_days', N'compliance.data_retention_days', N'{"value":365}', N'compliance', N'Dataretentie in dagen', 0),
    (N'compliance.gdpr_compliant', N'compliance.gdpr_compliant', N'{"value":true}', N'compliance', N'AVG compliant', 0)
) AS source (id, setting_key, setting_value, category, description, is_sensitive)
ON target.setting_key = source.setting_key
WHEN MATCHED THEN
    UPDATE SET
        id = source.id,
        setting_value = source.setting_value,
        category = source.category,
        description = source.description,
        is_sensitive = source.is_sensitive,
        updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (id, setting_key, setting_value, category, description, is_sensitive, updated_at, created_at)
    VALUES (source.id, source.setting_key, source.setting_value, source.category, source.description, source.is_sensitive, SYSUTCDATETIME(), SYSUTCDATETIME());
