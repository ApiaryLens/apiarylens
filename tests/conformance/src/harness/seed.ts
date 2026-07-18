import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ForeignSeed } from './backend.js';
import { FOREIGN_APIARY_NAME, jpegBytes, sha256Hex } from '../fixtures/data.js';

/**
 * Both deployment profiles persist the identical SQL schema (compose ships it
 * as a consolidated migration, Cloudflare as D1 migrations), so one seeding
 * routine arranges the foreign organization for either driver.
 */
export function seedForeignOrganizationRows(
  database: DatabaseSync,
  memberUserId: string,
): ForeignSeed {
  const organizationId = randomUUID();
  const apiaryId = randomUUID();
  const mediaId = randomUUID();
  const mediaBytes = jpegBytes(96, 0x2b);
  const timestamp = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO organizations(id, name, timezone, created_at, updated_at)
       VALUES (?, 'Foreign family', 'UTC', ?, ?)`,
    )
    .run(organizationId, timestamp, timestamp);
  database
    .prepare(
      `INSERT INTO memberships(id, organization_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'viewer', 'active', ?, ?)`,
    )
    .run(randomUUID(), organizationId, memberUserId, timestamp, timestamp);

  const apiaryValue = {
    id: apiaryId,
    organizationId,
    name: FOREIGN_APIARY_NAME,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
  const mediaValue = {
    id: mediaId,
    organizationId,
    hiveId: randomUUID(),
    fileName: 'foreign.jpg',
    mediaType: 'image/jpeg',
    byteSize: mediaBytes.byteLength,
    sha256: sha256Hex(mediaBytes),
    state: 'ready',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
  const insertResource = database.prepare(
    `INSERT INTO resources(organization_id, entity_type, id, version, value_json, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
  );
  insertResource.run(
    organizationId,
    'apiary',
    apiaryId,
    JSON.stringify(apiaryValue),
    timestamp,
    timestamp,
  );
  insertResource.run(
    organizationId,
    'mediaAsset',
    mediaId,
    JSON.stringify(mediaValue),
    timestamp,
    timestamp,
  );
  database
    .prepare(
      `INSERT INTO changes(organization_id, entity_type, entity_id, action, version, changed_at, value_json)
       VALUES (?, 'apiary', ?, 'upsert', 1, ?, ?)`,
    )
    .run(organizationId, apiaryId, timestamp, JSON.stringify(apiaryValue));

  return { organizationId, apiaryId, mediaId, mediaBytes, apiaryName: FOREIGN_APIARY_NAME };
}

export function readResourceValueRow(
  database: DatabaseSync,
  organizationId: string,
  entityType: string,
  id: string,
): Record<string, unknown> | undefined {
  const row = database
    .prepare(
      `SELECT value_json FROM resources
       WHERE organization_id = ? AND entity_type = ? AND id = ?`,
    )
    .get(organizationId, entityType, id) as { value_json: string } | undefined;
  return row ? (JSON.parse(row.value_json) as Record<string, unknown>) : undefined;
}
