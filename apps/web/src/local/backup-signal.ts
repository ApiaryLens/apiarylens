import { db } from './database.js';

const key = 'lastLocalBackupAt';

/**
 * Remember that a backup left this device (native archive or downloaded
 * export file). Local-only sessions surface this so a family sees honestly
 * how old their newest copy on THIS device is — other devices' backups are
 * unknown here and are never claimed.
 */
export async function recordLocalBackup(): Promise<void> {
  await db.settings.put({ key, value: new Date().toISOString() });
}

export async function lastLocalBackupAt(): Promise<string | undefined> {
  const value = (await db.settings.get(key))?.value;
  return typeof value === 'string' ? value : undefined;
}
