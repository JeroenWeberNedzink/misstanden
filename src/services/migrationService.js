export async function runMigrations() {
  return { success: true };
}

export async function getEmailNotificationStatus() {
  return {
    emailNotificationTablesExist: true,
    message: 'Runtime migration check disabled while SQL Server migration tooling is in place',
  };
}
