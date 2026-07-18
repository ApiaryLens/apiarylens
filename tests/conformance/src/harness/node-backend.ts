import { SqliteStore } from '@apiarylens/database';
import { MemoryMediaStore } from '@apiarylens/media';
import { createApi } from '@apiarylens/server';
import { AUTH_ROOT_SECRET } from '../fixtures/data.js';
import type { ConformanceBackend } from './backend.js';
import { readResourceValueRow, seedForeignOrganizationRows } from './seed.js';

/**
 * The Compose/Node deployment profile: the exact `@apiarylens/server` Hono
 * application over the shared SQLite store and media store, exercised
 * in-process the same way the packaged Windows standalone service and the
 * Compose container run it.
 */
export function createNodeBackend(): ConformanceBackend {
  const store = new SqliteStore(':memory:', { authRootSecret: AUTH_ROOT_SECRET });
  const mediaStore = new MemoryMediaStore();
  const app = createApi({
    store,
    mediaStore,
    secureCookies: true,
    authRootSecret: AUTH_ROOT_SECRET,
  });
  return {
    label: 'node',
    description: 'Compose/Node profile (@apiarylens/server + SqliteStore + media store)',
    request: (path, init) => Promise.resolve(app.request(path, init)),
    async seedForeignOrganization(memberUserId) {
      const seed = seedForeignOrganizationRows(store.database, memberUserId);
      await mediaStore.put(seed.organizationId, seed.mediaId, seed.mediaBytes);
      return seed;
    },
    readResourceValue: (organizationId, entityType, id) =>
      readResourceValueRow(store.database, organizationId, entityType, id),
    close: () => store.close(),
  };
}
