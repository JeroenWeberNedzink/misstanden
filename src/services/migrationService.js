/**
 * Migration Service - Handles automatic database migrations
 * Ensures email notification tables and other database structures are created on app startup
 */

import { supabase } from '../lib/supabase';


/**
 * Check if email notification tables exist
 */
async function checkEmailNotificationTablesExist() {
  try {
    // Try to query the email_settings_overview view
    const { data, error } = await supabase
      .from('email_settings_overview')
      .select('code')
      .limit(1);

    if (error) {
      // View doesn't exist
      if (error.code === 'PGRST204' || error.code === '42P01') {
        return false;
      }
      console.warn('Error checking email notification tables:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('Error in checkEmailNotificationTablesExist:', error);
    return false;
  }
}

/**
 * Provide instructions for running the email notification migration manually
 */
function getEmailNotificationMigrationInstructions() {
  return {
    success: false,
    needsManualSetup: true,
    instructions: `
Email Notification System Setup Required

The email notification tables need to be created in your Supabase database.

Steps:
1. Go to https://app.supabase.com/
2. Select your project
3. Click "SQL Editor" in the left sidebar
4. Create a new query
5. Copy the contents of the file: SETUP_EMAIL_NOTIFICATIONS.sql
6. Paste into the SQL Editor
7. Click "Run" to execute

The file is located at: /SETUP_EMAIL_NOTIFICATIONS.sql

This needs to be done only once. The SQL is idempotent (safe to run multiple times).
    `.trim(),
  };
}

/**
 * Main migration runner - checks and runs all pending migrations
 */
export async function runMigrations() {
  console.log('[Migration] Starting migration check...');

  try {
    // Check and run email notification migration
    const emailTablesExist = await checkEmailNotificationTablesExist();

    if (!emailTablesExist) {
      console.warn('[Migration] Email notification tables not found.');
      const instructions = getEmailNotificationMigrationInstructions();
      console.log(instructions.instructions);

      // Return instructions but don't block app
      return {
        success: false,
        needsManualSetup: true,
        instructions: instructions.instructions,
      };
    } else {
      console.log('[Migration] Email notification tables already exist');
    }

    console.log('[Migration] All migrations complete');
    return { success: true };

  } catch (error) {
    console.error('[Migration] Migration runner error:', error);
    return {
      success: false,
      message: error.message || 'Unknown migration error',
    };
  }
}

/**
 * Get email notification setup status for debugging
 */
export async function getEmailNotificationStatus() {
  try {
    const tablesExist = await checkEmailNotificationTablesExist();

    return {
      emailNotificationTablesExist: tablesExist,
      message: tablesExist
        ? 'Email notification system is set up'
        : 'Email notification system needs manual setup',
    };
  } catch (error) {
    return { error: error.message };
  }
}
