import { createHash, randomUUID } from 'node:crypto';
import type { SyncOperation } from '@apiarylens/contracts';

/** Shared secret both backend drivers are configured with (32+ characters). */
export const AUTH_ROOT_SECRET = 'conformance-authentication-root-secret-0123456789';

/** Canonical first-owner identity used by every fixture. */
export const OWNER = {
  identifier: 'owner@conformance.test',
  displayName: 'Conformance Owner',
  password: 'orchard hums with winter bees',
  organizationName: 'Conformance Family',
  timezone: 'America/New_York',
} as const;

export const MEMBER_PASSWORD = 'meadow keeps a careful ledger';

/** Stable client identity for fixture-issued sync operations. */
export const CLIENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

export const FOREIGN_APIARY_NAME = 'Private foreign apiary';

export const apiaryFields = {
  name: 'North orchard yard',
  location: 'Behind the cedar windbreak',
  notes: 'Canonical conformance apiary',
} as const;

export const hiveFields = (apiaryId: string) => ({
  apiaryId,
  name: 'Hive Aurora',
  status: 'active',
});

export const inspectionFields = (hiveId: string) => ({
  hiveId,
  inspectedAt: '2026-06-01T15:00:00.000Z',
  inspectorName: 'Conformance Owner',
  state: 'complete',
  temperament: 'calm',
  populationStrength: 'strong',
});

export function createOperation(
  entityType: SyncOperation['entityType'],
  payload: Record<string, unknown> | null,
  overrides: Partial<SyncOperation> = {},
): SyncOperation {
  return {
    operationId: randomUUID(),
    clientId: CLIENT_ID,
    entityType,
    entityId: randomUUID(),
    action: 'create',
    baseVersion: 0,
    payload,
    queuedAt: new Date().toISOString(),
    ...overrides,
  };
}

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

/** Deterministic JPEG-framed payload for media fixtures. */
export function jpegBytes(length = 1024, seed = 0x5a): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.max(length, 8));
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let index = 4; index < bytes.length - 2; index += 1) {
    bytes[index] = (seed + index * 7) % 256;
  }
  bytes[bytes.length - 2] = 0xff;
  bytes[bytes.length - 1] = 0xd9;
  return bytes;
}

export function mediaAssetFields(
  bytes: Uint8Array,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    hiveId: randomUUID(),
    fileName: 'frame-photo.jpg',
    mediaType: 'image/jpeg',
    byteSize: bytes.byteLength,
    sha256: sha256Hex(bytes),
    caption: 'Brood frame close-up',
    state: 'staged',
    ...overrides,
  };
}
