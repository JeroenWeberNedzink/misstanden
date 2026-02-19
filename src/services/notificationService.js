/**
 * Notification Service
 * Handles all notification logic including checking user preferences,
 * quiet hours, severity thresholds, etc. before sending emails
 */

import * as emailService from './emailService';
import { handlerProfileService } from './handlerProfileService';
import { ticketService } from './ticketService';
import { supabase } from '../lib/supabase';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const nl2br = (value) => escapeHtml(value).replace(/\n/g, '<br/>');

const commentStyles = `
<style>
  .section-title { margin: 0 0 8px 0; font-size: 16px; color: #0f172a; }
  .lead { margin: 0 0 12px 0; font-size: 15px; color: #1f2937; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 12px 0; }
  .meta-table { width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 6px 0; font-size: 14px; vertical-align: top; }
  .meta-label { width: 140px; color: #64748b; }
  .meta-value { color: #0f172a; }
  .muted { color: #64748b; font-size: 13px; }
</style>
`;

/**
 * Check if current time is within quiet hours
 * @param {string|null} startTime - Start time in HH:MM format or null
 * @param {string|null} endTime - End time in HH:MM format or null
 * @returns {boolean}
 */
function isWithinQuietHours(startTime, endTime) {
  // Return false if either time is missing, null, or empty string
  if (!startTime || !endTime || startTime === '' || endTime === '') {
    return false;
  }

  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    // Validate parsed values
    if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
      console.warn('[Notification] Invalid quiet hours format:', { startTime, endTime });
      return false;
    }

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle case where quiet hours span midnight
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch (error) {
    console.error('[Notification] Error checking quiet hours:', error);
    return false; // Default to not in quiet hours if there's an error
  }
}

/**
 * Check if current day is weekend
 * @returns {boolean}
 */
function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Get severity level number (higher = more severe)
 * @param {string} severity - Severity code
 * @returns {number}
 */
function getSeverityLevel(severity) {
  const levels = {
    'critical': 4,
    'high': 3,
    'medium': 2,
    'low': 1
  };
  return levels[severity?.toLowerCase()] || 2;
}

/**
 * Check if handler should receive notification based on their settings
 * @param {Object} settings - Handler notification settings
 * @param {string} notificationType - Type of notification (newAssignment, statusUpdate, etc.)
 * @param {string} ticketSeverity - Ticket severity code
 * @returns {boolean}
 */
function shouldNotifyHandler(settings, notificationType, ticketSeverity = 'medium') {
  if (!settings) return true; // Default to sending if no settings found

  // Check if email notifications are enabled
  if (!settings.emailEnabled) return false;

  // Check weekend notifications
  if (isWeekend() && !settings.weekendNotifications) {
    return false;
  }

  // Check quiet hours
  if (settings.quietHoursStart && settings.quietHoursEnd) {
    if (isWithinQuietHours(settings.quietHoursStart, settings.quietHoursEnd)) {
      // Only send critical notifications during quiet hours
      if (ticketSeverity?.toLowerCase() !== 'critical') {
        return false;
      }
    }
  }

  // Check severity threshold for immediate notifications
  if (settings.minSeverityImmediate) {
    const ticketLevel = getSeverityLevel(ticketSeverity);
    const thresholdLevel = getSeverityLevel(settings.minSeverityImmediate);

    if (ticketLevel < thresholdLevel) {
      // Below threshold - will be included in daily digest if enabled
      return false;
    }
  }

  // Check specific notification type settings
  const typeCheckMap = {
    'newAssignment': settings.notifyNewAssignments ?? true,
    'newReport': settings.notifyNewAssignments ?? true,
    'statusUpdate': settings.notifyStatusUpdates ?? true,
    'escalation': settings.notifyEscalations ?? true,
    'deadline': settings.notifyDeadlineReminders ?? true,
    'comment': settings.notifyComments ?? false,
    'message': settings.notifyComments ?? false // Use same setting as comments
  };

  return typeCheckMap[notificationType] ?? true;
}

/**
 * Notification Service
 */
export const notificationService = {
  /**
   * Send ticket creation confirmation to reporter
   * @param {Object} ticket - Ticket object
   * @returns {Promise<Object>}
   */
  async notifyReporterTicketCreated(ticket) {
    try {
      // Only send if reporter opted in
      if (!ticket.emailNotify || (!ticket.reporterEmail && !ticket.reporterEmailEncrypted)) {
        console.log('[Notification] Reporter did not opt-in for notifications');
        return { success: false, skipped: true, reason: 'No opt-in' };
      }

      const result = await emailService.sendReportConfirmationEmail(ticket);
      console.log('[Notification] Reporter confirmation sent:', result);
      return { success: true, result };
    } catch (error) {
      console.error('[Notification] Error sending reporter confirmation:', error);
      // Don't throw - email failure shouldn't break ticket creation
      return { success: false, error: error.message };
    }
  },

  /**
   * Notify all active handlers that are allowed to access this ticket workflow.
   * @param {Object} ticket - Newly created ticket
   * @returns {Promise<Object>}
   */
  async notifyHandlersNewReport(ticket) {
    const workflowCode = String(ticket?.workflowType || ticket?.workflow_type || '').trim();
    const severityCode = ticket?.severityCode || ticket?.severity_code || 'medium';

    if (!workflowCode) {
      return { success: false, skipped: true, reason: 'Missing workflow type' };
    }

    try {
      const { data: workflow, error: workflowError } = await supabase
        .from('workflows')
        .select('id, code')
        .eq('code', workflowCode)
        .maybeSingle();

      if (workflowError) {
        console.error('[Notification] Failed to load workflow for new report notifications:', workflowError);
        return { success: false, error: workflowError.message };
      }

      if (!workflow?.id) {
        return { success: false, skipped: true, reason: 'Workflow not found' };
      }

      const { data: routingRows, error: routingError } = await supabase
        .from('handler_workflows')
        .select('handler_id')
        .eq('workflow_id', workflow.id);

      if (routingError) {
        console.error('[Notification] Failed to load workflow handlers:', routingError);
        return { success: false, error: routingError.message };
      }

      const handlerIds = Array.from(new Set((routingRows || []).map((r) => r?.handler_id).filter(Boolean)));
      if (handlerIds.length === 0) {
        return { success: true, skipped: true, reason: 'No handlers assigned to workflow', totalCandidates: 0, sent: 0 };
      }

      const { data: handlers, error: handlerError } = await supabase
        .from('handlers')
        .select('id, name, email, active, language, preferred_language, locale')
        .in('id', handlerIds)
        .eq('active', true);

      if (handlerError) {
        console.error('[Notification] Failed to load active handlers for workflow:', handlerError);
        return { success: false, error: handlerError.message };
      }

      const recipients = (handlers || []).filter((h) => Boolean(h?.email));
      if (recipients.length === 0) {
        return { success: true, skipped: true, reason: 'No active handler recipients', totalCandidates: 0, sent: 0 };
      }

      const settled = await Promise.allSettled(
        recipients.map(async (handler) => {
          const settings = await handlerProfileService.getNotificationSettings(handler.id);
          if (!shouldNotifyHandler(settings, 'newReport', severityCode)) {
            return { handlerId: handler.id, skipped: true, reason: 'Handler preferences' };
          }

          const result = await emailService.sendHandlerNewReportEmail(ticket, handler);
          return { handlerId: handler.id, skipped: false, result };
        })
      );

      let sent = 0;
      let skipped = 0;
      const errors = [];

      for (const item of settled) {
        if (item.status === 'rejected') {
          errors.push(String(item.reason?.message || item.reason || 'Unknown error'));
          continue;
        }

        if (item.value?.skipped) {
          skipped += 1;
          continue;
        }

        if (item.value?.result?.success === false) {
          skipped += 1;
          continue;
        }

        sent += 1;
      }

      if (errors.length > 0) {
        console.error('[Notification] Some workflow handler notifications failed:', errors);
      } else {
        console.log('[Notification] Workflow handler notifications sent:', { workflowCode, sent, skipped });
      }

      return {
        success: errors.length === 0,
        workflowCode,
        totalCandidates: recipients.length,
        sent,
        skipped,
        errors,
      };
    } catch (error) {
      console.error('[Notification] Error notifying workflow handlers for new report:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Send handler assignment notification
   * @param {Object} ticket - Ticket object
   * @param {Object} handler - Handler object
   * @returns {Promise<Object>}
   */
  async notifyHandlerAssignment(ticket, handler) {
    try {
      if (!handler || !handler.email) {
        return { success: false, skipped: true, reason: 'No handler email' };
      }

      // Get handler notification settings
      const settings = await handlerProfileService.getNotificationSettings(handler.id);

      // Check if handler should receive this notification
      if (!shouldNotifyHandler(settings, 'newAssignment', ticket.severityCode)) {
        console.log('[Notification] Handler notification skipped due to preferences');
        return { success: false, skipped: true, reason: 'Handler preferences' };
      }

      const result = await emailService.sendHandlerAssignmentEmail(ticket, handler);
      console.log('[Notification] Handler assignment notification sent:', result);
      return { success: true, result };
    } catch (error) {
      console.error('[Notification] Error sending handler assignment notification:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Send status change notifications
   * @param {Object} ticket - Updated ticket object
   * @param {string} oldStatus - Previous status label
   * @param {string} newStatus - New status label
   * @returns {Promise<Object>}
   */
  async notifyStatusChange(ticket, oldStatus, newStatus) {
    const results = {
      reporter: null,
      handler: null
    };

    try {
      const reporterStatusNotify =
        ticket?.statusEmailNotify ?? ticket?.status_email_notify ?? true;
      // Notify reporter if they opted in
      if (
        ticket.emailNotify &&
        reporterStatusNotify &&
        (ticket.reporterEmail || ticket.reporterEmailEncrypted)
      ) {
        try {
          results.reporter = await emailService.sendStatusChangeEmail(ticket, oldStatus, newStatus);
          console.log('[Notification] Reporter status change notification sent');
        } catch (error) {
          console.error('[Notification] Error sending reporter status notification:', error);
          results.reporter = { success: false, error: error.message };
        }
      }

      // Notify handler if assigned
      if (ticket.handlerId) {
        try {
          // Get handler info
          const handler = await ticketService.getHandlerById(ticket.handlerId);

          if (handler) {
            // Check handler notification settings
            const settings = await handlerProfileService.getNotificationSettings(handler.id);

            if (shouldNotifyHandler(settings, 'statusUpdate', ticket.severityCode)) {
              results.handler = await emailService.sendHandlerStatusChangeEmail(
                ticket,
                handler,
                oldStatus,
                newStatus
              );
              console.log('[Notification] Handler status change notification sent');
            } else {
              results.handler = { success: false, skipped: true, reason: 'Handler preferences' };
            }
          }
        } catch (error) {
          console.error('[Notification] Error sending handler status notification:', error);
          results.handler = { success: false, error: error.message };
        }
      }

      return results;
    } catch (error) {
      console.error('[Notification] Error in notifyStatusChange:', error);
      return results;
    }
  },

  /**
   * Send comment notification
   * @param {Object} ticket - Ticket object
   * @param {string} comment - Comment text
   * @param {string} authorName - Comment author name
   * @param {boolean} isInternal - Whether comment is internal (handler only)
   * @returns {Promise<Object>}
   */
  async notifyComment(ticket, comment, authorName, isInternal = false) {
    const results = {
      reporter: null,
      handler: null
    };

    const statusLabel =
      ticket?.metadata?.statusLabel ||
      ticket?.statusLabel ||
      ticket?.status ||
      ticket?.statusCode ||
      '-';

    try {
      // Notify reporter for public comments only
      if (!isInternal && ticket.emailNotify && (ticket.reporterEmail || ticket.reporterEmailEncrypted)) {
        try {
          const language = emailService.resolveTicketLanguage(ticket);
          const copy = emailService.getReporterEmailCopy(language);
          const html = `
${commentStyles}
<h2 class="section-title">${escapeHtml(copy.commentTitle)}</h2>
<p class="lead">${escapeHtml(copy.greeting || 'Dear')} ${escapeHtml(ticket.reporterName || copy.reporterFallback)},</p>
<p class="lead">${escapeHtml(copy.commentIntro)}</p>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.comment)}</h3>
  <p><strong>${escapeHtml(copy.from)}:</strong> ${escapeHtml(authorName || copy.senderHandler || copy.notProvided)}</p>
  <div>${nl2br(comment || '-')}</div>
</div>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.reportOverview)}</h3>
  <table class="meta-table" role="presentation">
    <tr>
      <td class="meta-label">${escapeHtml(copy.ticketNumber)}</td>
      <td class="meta-value">${escapeHtml(ticket.ticketNumber || '-')}</td>
    </tr>
    <tr>
      <td class="meta-label">${escapeHtml(copy.currentStatus)}</td>
      <td class="meta-value">${escapeHtml(statusLabel)}</td>
    </tr>
    <tr>
      <td class="meta-label">${escapeHtml(copy.location)}</td>
      <td class="meta-value">${escapeHtml(ticket.location || copy.notProvided)}</td>
    </tr>
  </table>
</div>

<p class="muted">${escapeHtml(copy.openPortalComment)}</p>
`;

          results.reporter = await emailService.sendEmail({
            from: 'noreply@nedzink.nl',
            ...(ticket.reporterEmail ? { to: ticket.reporterEmail } : { toEncrypted: ticket.reporterEmailEncrypted }),
            subject: copy.subjectComment.replace('{{ticket}}', ticket.ticketNumber || '-'),
            html,
            useTemplate: true
          });
          console.log('[Notification] Reporter comment notification sent');
        } catch (error) {
          console.error('[Notification] Error sending reporter comment notification:', error);
          results.reporter = { success: false, error: error.message };
        }
      }

      // Notify handler if assigned
      if (ticket.handlerId) {
        try {
          const handler = await ticketService.getHandlerById(ticket.handlerId);
          if (handler) {
            const settings = await handlerProfileService.getNotificationSettings(handler.id);
            if (shouldNotifyHandler(settings, 'comment', ticket.severityCode)) {
              const html = `
${commentStyles}
<h2 class="section-title">Nieuwe ${isInternal ? 'interne ' : ''}opmerking</h2>
<p class="lead">Hallo ${escapeHtml(handler.name || 'collega')},</p>
<p class="lead">Er is een nieuwe ${isInternal ? 'interne ' : ''}opmerking toegevoegd aan de melding.</p>

<div class="card">
  <h3 class="section-title">Opmerking</h3>
  <p><strong>Van:</strong> ${escapeHtml(authorName || 'Onbekend')}</p>
  <div>${nl2br(comment || '-')}</div>
</div>

<div class="card">
  <h3 class="section-title">Melding</h3>
  <table class="meta-table" role="presentation">
    <tr>
      <td class="meta-label">Ticketnummer</td>
      <td class="meta-value">${escapeHtml(ticket.ticketNumber || '-')}</td>
    </tr>
    <tr>
      <td class="meta-label">Status</td>
      <td class="meta-value">${escapeHtml(statusLabel)}</td>
    </tr>
    <tr>
      <td class="meta-label">Locatie</td>
      <td class="meta-value">${escapeHtml(ticket.location || 'Niet opgegeven')}</td>
    </tr>
  </table>
</div>

<p class="muted">Log in op het portaal om de melding te bekijken.</p>
`;

              results.handler = await emailService.sendEmail({
                from: 'noreply@nedzink.nl',
                to: handler.email,
                subject: `Nieuwe opmerking: ${ticket.ticketNumber || ''}`,
                html,
                useTemplate: true
              });
              console.log('[Notification] Handler comment notification sent');
            } else {
              results.handler = { success: false, skipped: true, reason: 'Handler preferences' };
            }
          }
        } catch (error) {
          console.error('[Notification] Error sending handler comment notification:', error);
          results.handler = { success: false, error: error.message };
        }
      }

      return results;
    } catch (error) {
      console.error('[Notification] Error in notifyComment:', error);
      return results;
    }
  },

  /**
   * Notify reporter that processing has started after first handler assignment.
   * @param {Object} ticket - Ticket object
   * @param {Object} options - Additional context
   * @returns {Promise<Object>}
   */
  async notifyReporterAssignmentStarted(ticket, options = {}) {
    try {
      const hasReporterEmail = Boolean(ticket?.reporterEmail || ticket?.reporterEmailEncrypted);
      if (!ticket?.emailNotify || !hasReporterEmail) {
        return { success: false, skipped: true, reason: 'Reporter did not opt-in or email missing' };
      }

      const result = await emailService.sendReporterAssignmentStartedEmail(ticket, options);
      console.log('[Notification] Reporter assignment-started notification sent:', result);
      return { success: true, result };
    } catch (error) {
      console.error('[Notification] Error sending reporter assignment-started notification:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Send attachment added notification (public attachments only)
   * @param {Object} ticket - Ticket object
   * @param {Object} attachment - Attachment object
   * @param {string} uploaderName - Uploader name
   * @returns {Promise<Object>}
   */
  async notifyAttachmentAdded(ticket, attachment, uploaderName) {
    try {
      if (!ticket?.emailNotify || (!ticket.reporterEmail && !ticket.reporterEmailEncrypted)) {
        return { success: false, skipped: true, reason: 'No reporter email or opt-in' };
      }

      const result = await emailService.sendAttachmentAddedEmail(ticket, attachment, uploaderName);
      console.log('[Notification] Reporter attachment notification sent:', result);
      return { success: true, result };
    } catch (error) {
      console.error('[Notification] Error sending attachment notification:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Send message notification
   * @param {Object} ticket - Ticket object
   * @param {string} sender - Message sender
   * @param {string} body - Message body
   * @param {boolean} isInternal - Whether message is internal
   * @returns {Promise<Object>}
   */
  async notifyMessage(ticket, sender, body, isInternal = false, options = {}) {
    const results = {
      reporter: null,
      handler: null
    };

    if (isInternal) return results;

    const senderKey = String(sender || '').toLowerCase();
    const isFromReporter = senderKey === 'reporter';
    const isFromHandler = senderKey === 'handler';

    try {
      let assignedHandler = null;
      if (ticket?.handlerId) {
        try {
          assignedHandler = await ticketService.getHandlerById(ticket.handlerId);
        } catch (err) {
          console.warn('[Notification] Could not resolve assigned handler for message emails:', err);
        }
      }

      const reporterKnownName = String(ticket?.reporterName || '').trim();
      const isAnonymousReporter = Boolean(ticket?.isAnonymous || ticket?.is_anonymous);
      const reporterLanguage = emailService.resolveTicketLanguage(ticket);
      const reporterCopy = emailService.getReporterEmailCopy(reporterLanguage);
      const reporterDisplayName =
        !isAnonymousReporter && reporterKnownName
          ? reporterKnownName
          : (isAnonymousReporter
            ? (reporterCopy.senderAnonymousReporter || reporterCopy.senderReporter || reporterCopy.reporterFallback)
            : (reporterCopy.senderReporter || reporterCopy.reporterFallback));
      const handlerDisplayName = assignedHandler?.name || reporterCopy.senderHandler || 'Handler';
      const publicHandlerName = options?.discloseHandlerIdentity
        ? (String(options?.senderName || '').trim() || handlerDisplayName)
        : (reporterCopy.senderHandler || 'Handler');

      // Reporter sent -> notify assigned handler only
      if (isFromReporter || !isFromHandler) {
        if (assignedHandler?.email) {
          try {
            results.handler = await emailService.sendHandlerMessageEmail(ticket, assignedHandler, reporterDisplayName, body);
            console.log('[Notification] Handler message notification sent');
          } catch (error) {
            console.error('[Notification] Error sending handler message notification:', error);
            results.handler = { success: false, error: error.message };
          }
        } else if (ticket?.handlerId) {
          results.handler = { success: false, skipped: true, reason: 'No handler email' };
        }
        return results;
      }

      // Handler sent -> notify reporter only
      if (isFromHandler) {
        if (ticket?.emailNotify && (ticket.reporterEmail || ticket.reporterEmailEncrypted)) {
          try {
            results.reporter = await emailService.sendReporterMessageEmail(ticket, publicHandlerName, body);
            console.log('[Notification] Reporter message notification sent');
          } catch (error) {
            console.error('[Notification] Error sending reporter message notification:', error);
            results.reporter = { success: false, error: error.message };
          }
        } else {
          results.reporter = { success: false, skipped: true, reason: 'No reporter email or opt-in' };
        }
      }
    } catch (error) {
      console.error('[Notification] Error in notifyMessage:', error);
    }

    return results;
  },

  /**
   * Helper function to check handler notification preferences
   * @param {string} handlerId - Handler ID
   * @param {string} notificationType - Type of notification
   * @param {string} ticketSeverity - Ticket severity
   * @returns {Promise<boolean>}
   */
  async shouldNotifyHandler(handlerId, notificationType, ticketSeverity = 'medium') {
    try {
      const settings = await handlerProfileService.getNotificationSettings(handlerId);
      return shouldNotifyHandler(settings, notificationType, ticketSeverity);
    } catch (error) {
      console.error('[Notification] Error checking handler preferences:', error);
      return true; // Default to sending if we can't check preferences
    }
  }
};

export default notificationService;

