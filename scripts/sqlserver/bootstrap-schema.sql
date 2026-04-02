IF OBJECT_ID(N'dbo.handlers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.handlers (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_handlers PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(255) NOT NULL,
        email NVARCHAR(255) NULL,
        active BIT NOT NULL CONSTRAINT DF_handlers_active DEFAULT (1),
        phone NVARCHAR(50) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_handlers_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_handlers_updated_at DEFAULT SYSUTCDATETIME(),
        roles NVARCHAR(MAX) NOT NULL CONSTRAINT DF_handlers_roles DEFAULT N'["HANDLER"]',
        last_login DATETIME2(3) NULL,
        user_id NVARCHAR(255) NULL,
        picture NVARCHAR(1024) NULL,
        permissions NVARCHAR(MAX) NOT NULL CONSTRAINT DF_handlers_permissions DEFAULT N'{}'
    );
    CREATE UNIQUE INDEX UX_handlers_email ON dbo.handlers(email) WHERE email IS NOT NULL;
    CREATE INDEX IX_handlers_user_id ON dbo.handlers(user_id);
    CREATE INDEX IX_handlers_active ON dbo.handlers(active);
END;

IF OBJECT_ID(N'dbo.roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.roles (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_roles PRIMARY KEY DEFAULT NEWID(),
        code NVARCHAR(100) NOT NULL,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NULL,
        is_system BIT NOT NULL CONSTRAINT DF_roles_is_system DEFAULT (0),
        is_default BIT NOT NULL CONSTRAINT DF_roles_is_default DEFAULT (0),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_roles_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_roles_updated_at DEFAULT SYSUTCDATETIME()
    );
    CREATE UNIQUE INDEX UX_roles_code ON dbo.roles(code);
END;

IF OBJECT_ID(N'dbo.permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.permissions (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_permissions PRIMARY KEY DEFAULT NEWID(),
        code NVARCHAR(100) NOT NULL,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NULL,
        category NVARCHAR(100) NOT NULL,
        is_system BIT NOT NULL CONSTRAINT DF_permissions_is_system DEFAULT (0),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_permissions_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_permissions_updated_at DEFAULT SYSUTCDATETIME()
    );
    CREATE UNIQUE INDEX UX_permissions_code ON dbo.permissions(code);
END;

IF OBJECT_ID(N'dbo.role_permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.role_permissions (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_role_permissions PRIMARY KEY DEFAULT NEWID(),
        role_id UNIQUEIDENTIFIER NOT NULL,
        permission_id UNIQUEIDENTIFIER NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_role_permissions_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_role_permissions_role FOREIGN KEY (role_id) REFERENCES dbo.roles(id) ON DELETE CASCADE,
        CONSTRAINT FK_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES dbo.permissions(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX UX_role_permissions_role_permission ON dbo.role_permissions(role_id, permission_id);
END;

IF OBJECT_ID(N'dbo.handler_roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.handler_roles (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_handler_roles PRIMARY KEY DEFAULT NEWID(),
        handler_id UNIQUEIDENTIFIER NOT NULL,
        role_id UNIQUEIDENTIFIER NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_handler_roles_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_handler_roles_handler FOREIGN KEY (handler_id) REFERENCES dbo.handlers(id) ON DELETE CASCADE,
        CONSTRAINT FK_handler_roles_role FOREIGN KEY (role_id) REFERENCES dbo.roles(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX UX_handler_roles_handler_role ON dbo.handler_roles(handler_id, role_id);
END;

IF OBJECT_ID(N'dbo.workflows', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workflows (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_workflows PRIMARY KEY DEFAULT NEWID(),
        code NVARCHAR(100) NOT NULL,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NULL,
        active BIT NOT NULL CONSTRAINT DF_workflows_active DEFAULT (1),
        display_order INT NOT NULL CONSTRAINT DF_workflows_display_order DEFAULT (0),
        statutory_deadline_days INT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflows_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflows_updated_at DEFAULT SYSUTCDATETIME()
    );
    CREATE UNIQUE INDEX UX_workflows_code ON dbo.workflows(code);
END;

IF OBJECT_ID(N'dbo.workflow_statuses', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workflow_statuses (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_workflow_statuses PRIMARY KEY DEFAULT NEWID(),
        workflow_id UNIQUEIDENTIFIER NOT NULL,
        code NVARCHAR(100) NOT NULL,
        label NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NULL,
        color NVARCHAR(50) NULL,
        sort_order INT NOT NULL CONSTRAINT DF_workflow_statuses_sort_order DEFAULT (0),
        is_terminal BIT NOT NULL CONSTRAINT DF_workflow_statuses_is_terminal DEFAULT (0),
        is_first_response BIT NOT NULL CONSTRAINT DF_workflow_statuses_is_first_response DEFAULT (0),
        next_codes NVARCHAR(MAX) NULL,
        expected_duration_days INT NULL,
        contact_person_name NVARCHAR(255) NULL,
        contact_person_email NVARCHAR(255) NULL,
        contact_person_phone NVARCHAR(50) NULL,
        contact_notes NVARCHAR(MAX) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_statuses_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_statuses_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_workflow_statuses_workflow FOREIGN KEY (workflow_id) REFERENCES dbo.workflows(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX UX_workflow_statuses_workflow_code ON dbo.workflow_statuses(workflow_id, code);
    CREATE INDEX IX_workflow_statuses_workflow_sort ON dbo.workflow_statuses(workflow_id, sort_order);
END;

IF OBJECT_ID(N'dbo.handler_workflows', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.handler_workflows (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_handler_workflows PRIMARY KEY DEFAULT NEWID(),
        handler_id UNIQUEIDENTIFIER NOT NULL,
        workflow_id UNIQUEIDENTIFIER NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_handler_workflows_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_handler_workflows_handler FOREIGN KEY (handler_id) REFERENCES dbo.handlers(id) ON DELETE CASCADE,
        CONSTRAINT FK_handler_workflows_workflow FOREIGN KEY (workflow_id) REFERENCES dbo.workflows(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX UX_handler_workflows_handler_workflow ON dbo.handler_workflows(handler_id, workflow_id);
END;

IF OBJECT_ID(N'dbo.locations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.locations (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_locations PRIMARY KEY DEFAULT NEWID(),
        country_code NVARCHAR(10) NOT NULL,
        country_name NVARCHAR(255) NOT NULL,
        display_order INT NOT NULL CONSTRAINT DF_locations_display_order DEFAULT (0),
        active BIT NOT NULL CONSTRAINT DF_locations_active DEFAULT (1),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_locations_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_locations_updated_at DEFAULT SYSUTCDATETIME(),
        created_by UNIQUEIDENTIFIER NULL,
        updated_by UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_locations_created_by FOREIGN KEY (created_by) REFERENCES dbo.handlers(id),
        CONSTRAINT FK_locations_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.handlers(id)
    );
    CREATE UNIQUE INDEX UX_locations_country_code ON dbo.locations(country_code);
END;

IF OBJECT_ID(N'dbo.system_settings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.system_settings (
        id NVARCHAR(255) NOT NULL CONSTRAINT PK_system_settings PRIMARY KEY,
        setting_key NVARCHAR(255) NOT NULL,
        setting_value NVARCHAR(MAX) NOT NULL CONSTRAINT DF_system_settings_value DEFAULT N'{}',
        category NVARCHAR(100) NOT NULL,
        description NVARCHAR(MAX) NULL,
        is_sensitive BIT NOT NULL CONSTRAINT DF_system_settings_is_sensitive DEFAULT (0),
        updated_by UNIQUEIDENTIFIER NULL,
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_system_settings_updated_at DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_system_settings_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_system_settings_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.handlers(id)
    );
    CREATE UNIQUE INDEX UX_system_settings_key ON dbo.system_settings(setting_key);
END;

IF OBJECT_ID(N'dbo.incident_severities', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.incident_severities (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_incident_severities PRIMARY KEY DEFAULT NEWID(),
        code NVARCHAR(50) NOT NULL,
        label NVARCHAR(100) NOT NULL,
        description NVARCHAR(MAX) NULL,
        color NVARCHAR(50) NULL,
        sort_order INT NOT NULL CONSTRAINT DF_incident_severities_sort_order DEFAULT (0),
        active BIT NOT NULL CONSTRAINT DF_incident_severities_active DEFAULT (1),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_incident_severities_created_at DEFAULT SYSUTCDATETIME()
    );
    CREATE UNIQUE INDEX UX_incident_severities_code ON dbo.incident_severities(code);
END;

IF OBJECT_ID(N'dbo.tickets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.tickets (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tickets PRIMARY KEY DEFAULT NEWID(),
        ticket_number NVARCHAR(100) NOT NULL,
        access_code NVARCHAR(20) NULL,
        workflow_type NVARCHAR(100) NOT NULL,
        current_stage NVARCHAR(100) NULL,
        status_code NVARCHAR(100) NULL,
        severity_code NVARCHAR(50) NULL,
        description NVARCHAR(MAX) NULL,
        location NVARCHAR(500) NULL,
        location_id UNIQUEIDENTIFIER NULL,
        reporter_name NVARCHAR(255) NULL,
        reporter_email NVARCHAR(255) NULL,
        reporter_email_encrypted NVARCHAR(MAX) NULL,
        reporter_email_hash NVARCHAR(255) NULL,
        reporter_phone NVARCHAR(50) NULL,
        email_notify BIT NOT NULL CONSTRAINT DF_tickets_email_notify DEFAULT (0),
        status_email_notify BIT NOT NULL CONSTRAINT DF_tickets_status_email_notify DEFAULT (1),
        is_anonymous BIT NOT NULL CONSTRAINT DF_tickets_is_anonymous DEFAULT (0),
        metadata NVARCHAR(MAX) NOT NULL CONSTRAINT DF_tickets_metadata DEFAULT N'{}',
        handler_id UNIQUEIDENTIFIER NULL,
        next_step_due DATETIME2(3) NULL,
        submitted_at DATETIME2(3) NOT NULL CONSTRAINT DF_tickets_submitted_at DEFAULT SYSUTCDATETIME(),
        last_update_at DATETIME2(3) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_tickets_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_tickets_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_tickets_handler FOREIGN KEY (handler_id) REFERENCES dbo.handlers(id),
        CONSTRAINT FK_tickets_location FOREIGN KEY (location_id) REFERENCES dbo.locations(id)
    );
    CREATE UNIQUE INDEX UX_tickets_ticket_number ON dbo.tickets(ticket_number);
    CREATE INDEX IX_tickets_submitted_at ON dbo.tickets(submitted_at);
    CREATE INDEX IX_tickets_status_code ON dbo.tickets(status_code);
    CREATE INDEX IX_tickets_workflow_type ON dbo.tickets(workflow_type);
    CREATE INDEX IX_tickets_reporter_email_hash ON dbo.tickets(reporter_email_hash);
END;

IF OBJECT_ID(N'dbo.ticket_handlers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ticket_handlers (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ticket_handlers PRIMARY KEY DEFAULT NEWID(),
        ticket_id UNIQUEIDENTIFIER NOT NULL,
        handler_id UNIQUEIDENTIFIER NOT NULL,
        role NVARCHAR(50) NOT NULL CONSTRAINT DF_ticket_handlers_role DEFAULT N'primary',
        assigned_at DATETIME2(3) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_handlers_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ticket_handlers_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_ticket_handlers_handler FOREIGN KEY (handler_id) REFERENCES dbo.handlers(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX UX_ticket_handlers_ticket_handler ON dbo.ticket_handlers(ticket_id, handler_id);
    CREATE INDEX IX_ticket_handlers_role ON dbo.ticket_handlers(role);
END;

IF OBJECT_ID(N'dbo.ticket_comments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ticket_comments (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ticket_comments PRIMARY KEY DEFAULT NEWID(),
        ticket_id UNIQUEIDENTIFIER NOT NULL,
        comment NVARCHAR(MAX) NOT NULL,
        author_name NVARCHAR(255) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_comments_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_comments_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ticket_comments_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'dbo.messages', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.messages (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_messages PRIMARY KEY DEFAULT NEWID(),
        ticket_id UNIQUEIDENTIFIER NOT NULL,
        sender NVARCHAR(50) NOT NULL,
        body NVARCHAR(MAX) NOT NULL,
        is_internal BIT NOT NULL CONSTRAINT DF_messages_is_internal DEFAULT (0),
        visible_at DATETIME2(3) NOT NULL CONSTRAINT DF_messages_visible_at DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_messages_created_at DEFAULT SYSUTCDATETIME(),
        read_at DATETIME2(3) NULL,
        handler_id UNIQUEIDENTIFIER NULL,
        handler_name NVARCHAR(255) NULL,
        CONSTRAINT FK_messages_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_messages_handler FOREIGN KEY (handler_id) REFERENCES dbo.handlers(id)
    );
    CREATE INDEX IX_messages_ticket_visible_at ON dbo.messages(ticket_id, visible_at);
END;

IF OBJECT_ID(N'dbo.attachments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.attachments (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_attachments PRIMARY KEY DEFAULT NEWID(),
        ticket_id UNIQUEIDENTIFIER NOT NULL,
        file_name NVARCHAR(255) NOT NULL,
        file_url NVARCHAR(2048) NOT NULL,
        mime_type NVARCHAR(255) NULL,
        size_bytes BIGINT NULL,
        is_internal BIT NOT NULL CONSTRAINT DF_attachments_is_internal DEFAULT (0),
        note_id UNIQUEIDENTIFIER NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_attachments_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_attachments_note FOREIGN KEY (note_id) REFERENCES dbo.ticket_comments(id)
    );
END;

IF OBJECT_ID(N'dbo.ticket_actions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ticket_actions (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ticket_actions PRIMARY KEY DEFAULT NEWID(),
        ticket_id UNIQUEIDENTIFIER NOT NULL,
        action_type NVARCHAR(100) NOT NULL,
        action NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NULL,
        handler_id UNIQUEIDENTIFIER NULL,
        handler_name NVARCHAR(255) NULL,
        handler_email NVARCHAR(255) NULL,
        performed_by NVARCHAR(255) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_actions_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ticket_actions_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_ticket_actions_handler FOREIGN KEY (handler_id) REFERENCES dbo.handlers(id)
    );
    CREATE INDEX IX_ticket_actions_ticket_created_at ON dbo.ticket_actions(ticket_id, created_at DESC);
END;

IF OBJECT_ID(N'dbo.access_requests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.access_requests (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_access_requests PRIMARY KEY DEFAULT NEWID(),
        user_id NVARCHAR(255) NOT NULL,
        email NVARCHAR(255) NULL,
        name NVARCHAR(255) NULL,
        picture NVARCHAR(1024) NULL,
        status NVARCHAR(50) NOT NULL CONSTRAINT DF_access_requests_status DEFAULT N'pending',
        request_message NVARCHAR(MAX) NULL,
        review_notes NVARCHAR(MAX) NULL,
        created_handler_id UNIQUEIDENTIFIER NULL,
        reviewed_by UNIQUEIDENTIFIER NULL,
        reviewed_at DATETIME2(3) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_access_requests_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_access_requests_updated_at DEFAULT SYSUTCDATETIME(),
        metadata NVARCHAR(MAX) NOT NULL CONSTRAINT DF_access_requests_metadata DEFAULT N'{}',
        CONSTRAINT FK_access_requests_created_handler FOREIGN KEY (created_handler_id) REFERENCES dbo.handlers(id),
        CONSTRAINT FK_access_requests_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES dbo.handlers(id)
    );
    CREATE INDEX IX_access_requests_status_created_at ON dbo.access_requests(status, created_at DESC);
    CREATE INDEX IX_access_requests_user_id ON dbo.access_requests(user_id);
END;

IF OBJECT_ID(N'dbo.ticket_reply_tokens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ticket_reply_tokens (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ticket_reply_tokens PRIMARY KEY DEFAULT NEWID(),
        ticket_id UNIQUEIDENTIFIER NOT NULL,
        token NVARCHAR(255) NOT NULL,
        expires_at DATETIME2(3) NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_reply_tokens_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ticket_reply_tokens_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX UX_ticket_reply_tokens_token ON dbo.ticket_reply_tokens(token);
END;

IF OBJECT_ID(N'dbo.guest_access', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.guest_access (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_guest_access PRIMARY KEY DEFAULT NEWID(),
        ticket_id UNIQUEIDENTIFIER NOT NULL,
        token NVARCHAR(255) NOT NULL,
        role NVARCHAR(50) NOT NULL CONSTRAINT DF_guest_access_role DEFAULT N'viewer',
        expires_at DATETIME2(3) NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_guest_access_created_at DEFAULT SYSUTCDATETIME(),
        created_by UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_guest_access_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE,
        CONSTRAINT FK_guest_access_created_by FOREIGN KEY (created_by) REFERENCES dbo.handlers(id)
    );
    CREATE UNIQUE INDEX UX_guest_access_token ON dbo.guest_access(token);
END;

IF OBJECT_ID(N'dbo.sla_escalations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sla_escalations (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_sla_escalations PRIMARY KEY DEFAULT NEWID(),
        ticket_id UNIQUEIDENTIFIER NOT NULL,
        escalated_at DATETIME2(3) NOT NULL CONSTRAINT DF_sla_escalations_escalated_at DEFAULT SYSUTCDATETIME(),
        reason NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_sla_escalations_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_sla_escalations_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'dbo.email_event_types', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.email_event_types (
        code NVARCHAR(100) NOT NULL CONSTRAINT PK_email_event_types PRIMARY KEY,
        category NVARCHAR(50) NOT NULL,
        name_en NVARCHAR(255) NOT NULL,
        name_nl NVARCHAR(255) NOT NULL,
        description_en NVARCHAR(MAX) NULL,
        description_nl NVARCHAR(MAX) NULL,
        is_system_critical BIT NOT NULL CONSTRAINT DF_email_event_types_is_system_critical DEFAULT (0),
        enabled_by_default BIT NOT NULL CONSTRAINT DF_email_event_types_enabled_by_default DEFAULT (1),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_email_event_types_created_at DEFAULT SYSUTCDATETIME()
    );
END;

IF OBJECT_ID(N'dbo.email_admin_settings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.email_admin_settings (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_email_admin_settings PRIMARY KEY DEFAULT NEWID(),
        event_type_code NVARCHAR(100) NOT NULL,
        is_enabled BIT NOT NULL CONSTRAINT DF_email_admin_settings_enabled DEFAULT (1),
        send_to_reporters BIT NOT NULL CONSTRAINT DF_email_admin_settings_reporters DEFAULT (1),
        send_to_handlers BIT NOT NULL CONSTRAINT DF_email_admin_settings_handlers DEFAULT (1),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_email_admin_settings_updated_at DEFAULT SYSUTCDATETIME(),
        updated_by UNIQUEIDENTIFIER NULL,
        CONSTRAINT FK_email_admin_settings_event FOREIGN KEY (event_type_code) REFERENCES dbo.email_event_types(code) ON DELETE CASCADE,
        CONSTRAINT FK_email_admin_settings_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.handlers(id)
    );
    CREATE UNIQUE INDEX UX_email_admin_settings_event_type_code ON dbo.email_admin_settings(event_type_code);
END;

IF OBJECT_ID(N'dbo.handler_email_preferences', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.handler_email_preferences (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_handler_email_preferences PRIMARY KEY DEFAULT NEWID(),
        handler_id UNIQUEIDENTIFIER NOT NULL,
        event_type_code NVARCHAR(100) NOT NULL,
        is_enabled BIT NOT NULL CONSTRAINT DF_handler_email_preferences_is_enabled DEFAULT (1),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_handler_email_preferences_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_handler_email_preferences_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_handler_email_preferences_handler FOREIGN KEY (handler_id) REFERENCES dbo.handlers(id) ON DELETE CASCADE,
        CONSTRAINT FK_handler_email_preferences_event FOREIGN KEY (event_type_code) REFERENCES dbo.email_event_types(code) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX UX_handler_email_preferences_handler_event ON dbo.handler_email_preferences(handler_id, event_type_code);
END;

IF OBJECT_ID(N'dbo.handler_notification_settings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.handler_notification_settings (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_handler_notification_settings PRIMARY KEY DEFAULT NEWID(),
        handler_id UNIQUEIDENTIFIER NOT NULL,
        email_enabled BIT NOT NULL CONSTRAINT DF_handler_notification_settings_email_enabled DEFAULT (1),
        notify_new_assignments BIT NOT NULL CONSTRAINT DF_handler_notification_settings_new_assignments DEFAULT (1),
        notify_status_updates BIT NOT NULL CONSTRAINT DF_handler_notification_settings_status_updates DEFAULT (1),
        notify_escalations BIT NOT NULL CONSTRAINT DF_handler_notification_settings_escalations DEFAULT (1),
        notify_deadline_reminders BIT NOT NULL CONSTRAINT DF_handler_notification_settings_deadlines DEFAULT (1),
        notify_comments BIT NOT NULL CONSTRAINT DF_handler_notification_settings_comments DEFAULT (0),
        min_severity_immediate NVARCHAR(50) NULL,
        daily_digest_enabled BIT NOT NULL CONSTRAINT DF_handler_notification_settings_daily_digest DEFAULT (0),
        quiet_hours_start NVARCHAR(10) NULL,
        quiet_hours_end NVARCHAR(10) NULL,
        weekend_notifications BIT NOT NULL CONSTRAINT DF_handler_notification_settings_weekend DEFAULT (0),
        emergency_contact_phone NVARCHAR(50) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_handler_notification_settings_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_handler_notification_settings_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_handler_notification_settings_handler FOREIGN KEY (handler_id) REFERENCES dbo.handlers(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX UX_handler_notification_settings_handler ON dbo.handler_notification_settings(handler_id);
END;

IF OBJECT_ID(N'dbo.user_availability', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_availability (
        user_id NVARCHAR(255) NOT NULL CONSTRAINT PK_user_availability PRIMARY KEY,
        is_available BIT NOT NULL CONSTRAINT DF_user_availability_is_available DEFAULT (1),
        status NVARCHAR(50) NULL,
        status_message NVARCHAR(MAX) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_user_availability_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_user_availability_updated_at DEFAULT SYSUTCDATETIME()
    );
END;

IF OBJECT_ID(N'dbo.notification_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.notification_logs (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_notification_logs PRIMARY KEY DEFAULT NEWID(),
        user_id NVARCHAR(255) NULL,
        channel NVARCHAR(50) NOT NULL,
        status NVARCHAR(50) NOT NULL,
        event NVARCHAR(100) NULL,
        error_message NVARCHAR(MAX) NULL,
        metadata NVARCHAR(MAX) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_notification_logs_created_at DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_notification_logs_created_at ON dbo.notification_logs(created_at DESC);
END;

IF OBJECT_ID(N'dbo.translation_audit_log', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.translation_audit_log (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_translation_audit_log PRIMARY KEY DEFAULT NEWID(),
        key_path NVARCHAR(500) NOT NULL,
        language_code NVARCHAR(10) NOT NULL,
        old_value NVARCHAR(MAX) NULL,
        new_value NVARCHAR(MAX) NULL,
        action NVARCHAR(50) NOT NULL,
        changed_by UNIQUEIDENTIFIER NULL,
        changed_at DATETIME2(3) NOT NULL CONSTRAINT DF_translation_audit_log_changed_at DEFAULT SYSUTCDATETIME(),
        metadata NVARCHAR(MAX) NULL,
        CONSTRAINT FK_translation_audit_log_changed_by FOREIGN KEY (changed_by) REFERENCES dbo.handlers(id)
    );
END;

IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.audit_logs (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_audit_logs PRIMARY KEY DEFAULT NEWID(),
        occurred_at DATETIME2(3) NOT NULL CONSTRAINT DF_audit_logs_occurred_at DEFAULT SYSUTCDATETIME(),
        schema_name NVARCHAR(100) NOT NULL,
        table_name NVARCHAR(255) NOT NULL,
        operation NVARCHAR(50) NOT NULL,
        row_id NVARCHAR(255) NULL,
        changed_by NVARCHAR(255) NULL,
        old_data NVARCHAR(MAX) NULL,
        new_data NVARCHAR(MAX) NULL
    );
    CREATE INDEX IX_audit_logs_occurred_at ON dbo.audit_logs(occurred_at DESC);
END;

IF OBJECT_ID(N'dbo.workflow_phases', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workflow_phases (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_workflow_phases PRIMARY KEY DEFAULT NEWID(),
        workflow_id UNIQUEIDENTIFIER NOT NULL,
        phase_code NVARCHAR(100) NULL,
        phase_name NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NULL,
        sort_order INT NOT NULL CONSTRAINT DF_workflow_phases_sort_order DEFAULT (0),
        deadline_days INT NULL,
        active BIT NOT NULL CONSTRAINT DF_workflow_phases_active DEFAULT (1),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_phases_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_phases_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_workflow_phases_workflow FOREIGN KEY (workflow_id) REFERENCES dbo.workflows(id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'dbo.workflow_phase_steps', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workflow_phase_steps (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_workflow_phase_steps PRIMARY KEY DEFAULT NEWID(),
        phase_id UNIQUEIDENTIFIER NOT NULL,
        step_code NVARCHAR(100) NULL,
        step_name NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NULL,
        sort_order INT NOT NULL CONSTRAINT DF_workflow_phase_steps_sort_order DEFAULT (0),
        is_required BIT NOT NULL CONSTRAINT DF_workflow_phase_steps_is_required DEFAULT (0),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_phase_steps_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_phase_steps_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_workflow_phase_steps_phase FOREIGN KEY (phase_id) REFERENCES dbo.workflow_phases(id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'dbo.workflow_contacts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workflow_contacts (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_workflow_contacts PRIMARY KEY DEFAULT NEWID(),
        workflow_id UNIQUEIDENTIFIER NOT NULL,
        phase_id UNIQUEIDENTIFIER NULL,
        contact_type NVARCHAR(100) NULL,
        contact_name NVARCHAR(255) NULL,
        organization NVARCHAR(255) NULL,
        email NVARCHAR(255) NULL,
        phone NVARCHAR(50) NULL,
        website_url NVARCHAR(1024) NULL,
        notes NVARCHAR(MAX) NULL,
        country_code NVARCHAR(10) NULL,
        sort_order INT NOT NULL CONSTRAINT DF_workflow_contacts_sort_order DEFAULT (0),
        active BIT NOT NULL CONSTRAINT DF_workflow_contacts_active DEFAULT (1),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_contacts_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_contacts_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_workflow_contacts_workflow FOREIGN KEY (workflow_id) REFERENCES dbo.workflows(id) ON DELETE CASCADE,
        CONSTRAINT FK_workflow_contacts_phase FOREIGN KEY (phase_id) REFERENCES dbo.workflow_phases(id)
    );
END;

IF OBJECT_ID(N'dbo.user_profiles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_profiles (
        id NVARCHAR(255) NOT NULL CONSTRAINT PK_user_profiles PRIMARY KEY,
        email NVARCHAR(255) NULL,
        name NVARCHAR(255) NULL,
        picture NVARCHAR(1024) NULL,
        metadata NVARCHAR(MAX) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_user_profiles_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_user_profiles_updated_at DEFAULT SYSUTCDATETIME()
    );
END;

IF OBJECT_ID(N'dbo.email_settings_overview', N'V') IS NOT NULL
BEGIN
    DROP VIEW dbo.email_settings_overview;
END;
EXEC('
CREATE VIEW dbo.email_settings_overview AS
SELECT
    et.code,
    et.category,
    et.name_en,
    et.name_nl,
    et.description_en,
    et.description_nl,
    et.is_system_critical,
    et.enabled_by_default,
    ISNULL(eas.is_enabled, et.enabled_by_default) AS is_enabled,
    ISNULL(eas.send_to_reporters, 1) AS send_to_reporters,
    ISNULL(eas.send_to_handlers, 1) AS send_to_handlers,
    eas.updated_at,
    eas.updated_by
FROM dbo.email_event_types et
LEFT JOIN dbo.email_admin_settings eas
    ON eas.event_type_code = et.code
');

MERGE dbo.incident_severities AS target
USING (VALUES
    (N'low', N'Laag', 1, N'#84cc16'),
    (N'medium', N'Gemiddeld', 2, N'#f59e0b'),
    (N'high', N'Hoog', 3, N'#f97316'),
    (N'critical', N'Kritiek', 4, N'#dc2626')
) AS source (code, label, sort_order, color)
ON target.code = source.code
WHEN NOT MATCHED THEN
    INSERT (code, label, sort_order, color, active)
    VALUES (source.code, source.label, source.sort_order, source.color, 1);

MERGE dbo.email_event_types AS target
USING (VALUES
    (N'TICKET_CREATED', N'ticket', N'Ticket Created', N'Ticket Aangemaakt', N'Send when a new ticket is created', N'Versturen wanneer een nieuw ticket wordt aangemaakt', 0, 1),
    (N'TICKET_ASSIGNED', N'ticket', N'Ticket Assigned', N'Ticket Toegewezen', N'Send when a ticket is assigned to a handler', N'Versturen wanneer een ticket wordt toegewezen aan een behandelaar', 0, 1),
    (N'TICKET_STATUS_CHANGED', N'ticket', N'Status Changed', N'Status Gewijzigd', N'Send when ticket status changes', N'Versturen wanneer de ticket status wijzigt', 0, 1),
    (N'TICKET_COMMENT_ADDED', N'ticket', N'Comment Added', N'Reactie Toegevoegd', N'Send when a comment is added to a ticket', N'Versturen wanneer een reactie wordt toegevoegd aan een ticket', 0, 1),
    (N'TICKET_RESOLVED', N'ticket', N'Ticket Resolved', N'Ticket Opgelost', N'Send when a ticket is marked as resolved', N'Versturen wanneer een ticket als opgelost wordt gemarkeerd', 0, 1),
    (N'TICKET_CLOSED', N'ticket', N'Ticket Closed', N'Ticket Gesloten', N'Send when a ticket is closed', N'Versturen wanneer een ticket wordt gesloten', 0, 1),
    (N'TICKET_REOPENED', N'ticket', N'Ticket Reopened', N'Ticket Heropend', N'Send when a resolved or closed ticket is reopened', N'Versturen wanneer een opgelost of gesloten ticket wordt heropend', 0, 1),
    (N'HANDLER_ASSIGNED', N'handler', N'Assigned to You', N'Aan Jou Toegewezen', N'Send when a ticket is assigned to you', N'Versturen wanneer een ticket aan jou wordt toegewezen', 0, 1),
    (N'HANDLER_MENTIONED', N'handler', N'Mentioned in Comment', N'Vermeld in Reactie', N'Send when you are mentioned in a comment', N'Versturen wanneer je wordt vermeld in een reactie', 0, 1),
    (N'HANDLER_DAILY_DIGEST', N'handler', N'Daily Digest', N'Dagelijkse Samenvatting', N'Daily summary of pending tickets', N'Dagelijkse samenvatting van openstaande tickets', 0, 0),
    (N'SLA_WARNING', N'sla', N'SLA Warning', N'SLA Waarschuwing', N'Send when SLA deadline is approaching', N'Versturen wanneer SLA deadline nadert', 1, 1),
    (N'SLA_BREACH', N'sla', N'SLA Breach', N'SLA Schending', N'Send when SLA deadline is exceeded', N'Versturen wanneer SLA deadline wordt overschreden', 1, 1),
    (N'SYSTEM_ERROR', N'system', N'System Error', N'Systeemfout', N'Send when a critical system error occurs', N'Versturen bij een kritieke systeemfout', 1, 1),
    (N'SYSTEM_MAINTENANCE', N'system', N'Maintenance Notice', N'Onderhoudsbericht', N'Send maintenance notifications', N'Versturen van onderhoudsberichten', 0, 1),
    (N'SYSTEM_UPDATE', N'system', N'System Update', N'Systeem Update', N'Send notifications about system updates', N'Versturen van berichten over systeem updates', 0, 0)
) AS source (code, category, name_en, name_nl, description_en, description_nl, is_system_critical, enabled_by_default)
ON target.code = source.code
WHEN NOT MATCHED THEN
    INSERT (code, category, name_en, name_nl, description_en, description_nl, is_system_critical, enabled_by_default)
    VALUES (source.code, source.category, source.name_en, source.name_nl, source.description_en, source.description_nl, source.is_system_critical, source.enabled_by_default);
