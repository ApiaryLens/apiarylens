import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './database.js';
import type { LocalResource } from './types.js';

export function useResources(organizationId: string, entityType: LocalResource['entityType']) {
  return useLiveQuery(
    () =>
      db.resources
        .where('[organizationId+entityType]')
        .equals([organizationId, entityType])
        .toArray(),
    [organizationId, entityType],
    [],
  );
}
