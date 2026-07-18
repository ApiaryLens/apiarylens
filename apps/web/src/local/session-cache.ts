import type { SessionView } from '@apiarylens/contracts';
import { db } from './database.js';

export async function cacheSession(session: SessionView): Promise<void> {
  const { csrfToken: _csrfToken, ...offlineSession } = session;
  await db.settings.put({ key: 'session', value: offlineSession });
}

export async function cachedSession(): Promise<Omit<SessionView, 'csrfToken'> | undefined> {
  return (await db.settings.get('session'))?.value as Omit<SessionView, 'csrfToken'> | undefined;
}

export async function clearCachedSession(): Promise<void> {
  await db.settings.delete('session');
}

export async function clearLocalWorkspace(): Promise<void> {
  await db.transaction('rw', db.resources, db.outbox, db.settings, db.media, async () => {
    await Promise.all([
      db.resources.clear(),
      db.outbox.clear(),
      db.settings.clear(),
      db.media.clear(),
    ]);
  });
}
