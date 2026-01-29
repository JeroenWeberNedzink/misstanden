/**
 * Notification Service
 * Handles all notification logic including checking user preferences,
 * quiet hours, severity thresholds, etc. before sending emails
 */

import * as emailService from './emailService';
import { handlerProfileService } from './handlerProfileService';
import { ticketService } from './ticketService';

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
      if (!ticket.emailNotify || !ticket.reporterEmail) {
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
      // Notify reporter if they opted in
      if (ticket.emailNotify && ticket.reporterEmail) {
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

    try {
      // Notify reporter for public comments only
      if (!isInternal && ticket.emailNotify && ticket.reporterEmail) {
        try {
          const html = `
<style>
  .comment-box { background: #f9fafb; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; border-radius: 4px; }
  h2 { color: #1f2937; margin: 0 0 10px 0; }
</style>
<h2>💬 Nieuwe Opmerking</h2>
<p>Beste ${ticket.reporterName || 'melder'},</p>
<p>Er is een nieuwe opmerking toegevoegd aan uw melding:</p>
<div class="comment-box">
  <h3 style="margin:0 0 10px 0;">Ticket #${ticket.ticketNumber}</h3>
  <p><strong>Van:</strong> ${authorName}</p>
  <p><strong>Opmerking:</strong></p>
  <p>${comment}</p>
</div>
<p style="margin-top:20px;font-size:13px;color:#6b7280;">
  U kunt uw melding bekijken met uw ticketnummer en toegangscode.
</p>
`;

          results.reporter = await emailService.sendEmail({
            from: 'noreply@nedzink.nl',
            to: ticket.reporterEmail,
            subject: `💬 Nieuwe opmerking: ${ticket.ticketNumber}`,
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
<style>
  .comment-box { background: #f9fafb; border-left: 4px solid #0ea5e9; padding: 15px; margin: 15px 0; border-radius: 4px; }
  h2 { color: #1f2937; margin: 0 0 10px 0; }
</style>
<h2>💬 Nieuwe Opmerking</h2>
<p>Hallo ${handler.name},</p>
<p>Er is een nieuwe ${isInternal ? 'interne ' : ''}opmerking toegevoegd:</p>
<div class="comment-box">
  <h3 style="margin:0 0 10px 0;">Ticket #${ticket.ticketNumber}</h3>
  <p><strong>Van:</strong> ${authorName}</p>
  <p><strong>Opmerking:</strong></p>
  <p>${comment}</p>
</div>
<p style="margin-top:20px;font-size:13px;color:#6b7280;">
  Log in op het portaal om deze melding te bekijken.
</p>
`;

              results.handler = await emailService.sendEmail({
                from: 'noreply@nedzink.nl',
                to: handler.email,
                subject: `💬 Nieuwe opmerking: ${ticket.ticketNumber}`,
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
   * Send message notification
   * @param {Object} ticket - Ticket object
   * @param {string} sender - Message sender
   * @param {string} body - Message body
   * @param {boolean} isInternal - Whether message is internal
   * @returns {Promise<Object>}
   */
  async notifyMessage(ticket, sender, body, isInternal = false) {
    // For now, treat messages similar to comments
    return this.notifyComment(ticket, body, sender, isInternal);
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
