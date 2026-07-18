import type { ResourceType } from '@apiarylens/contracts';
import type { LocalResource } from '../local/types.js';

export const recordKey = (organizationId: string, entityType: ResourceType, id: string) =>
  `${organizationId}:${entityType}:${id}`;

export function serverRecord(
  entityType: ResourceType,
  value: Record<string, unknown>,
): LocalResource {
  const organizationId = String(value.organizationId);
  const id = String(value.id);
  const {
    id: _id,
    organizationId: _organizationId,
    version,
    createdAt,
    updatedAt,
    deletedAt,
    ...data
  } = value;
  return {
    key: recordKey(organizationId, entityType, id),
    id,
    organizationId,
    entityType,
    version: Number(version),
    createdAt: String(createdAt),
    updatedAt: String(updatedAt),
    deletedAt: deletedAt === null ? null : String(deletedAt),
    syncState: 'synchronized',
    data,
  };
}
