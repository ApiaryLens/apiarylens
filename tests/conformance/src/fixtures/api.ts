import {
  API_CONTRACT_VERSION,
  PRODUCT_NAME,
  PRODUCT_VERSION,
  apiErrorSchema,
  buildOpenApiDocument,
  resourceSchemas,
  resourceTypeSchema,
  sessionViewSchema,
  type BuildIdentity,
} from '@apiarylens/contracts';
import { strFromU8, unzipSync } from 'fflate';
import { expect } from 'vitest';
import { readErrorCode, readJson } from '../harness/actor.js';
import { OWNER, apiaryFields, createOperation, jpegBytes, mediaAssetFields } from './data.js';
import type { ConformanceFixture } from './types.js';

const SESSION_COOKIE = '__Host-apiarylens-session';

export const apiFixtures: readonly ConformanceFixture[] = [
  {
    contract: 'api/health.build-identity',
    title: 'health endpoint reports the canonical product and contract identity',
    async run(world) {
      const response = await world.guest().request('/health');
      expect(response.status).toBe(200);
      const body = await readJson<{
        status: string;
        product: string;
        version: string;
        build: BuildIdentity;
      }>(response);
      expect(body.status).toBe('ok');
      expect(body.product).toBe(PRODUCT_NAME);
      expect(body.version).toBe(PRODUCT_VERSION);
      expect(body.build.apiContract).toBe(API_CONTRACT_VERSION);
      expect(body.build.syncContract).toBe(1);
      expect(typeof body.build.deploymentProfile).toBe('string');
    },
  },
  {
    contract: 'api/openapi.canonical-document',
    title: 'every backend serves exactly the canonical OpenAPI 3.1 contract document',
    async run(world) {
      const response = await world.guest().request('/api/v1/openapi.json');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
    },
  },
  {
    contract: 'api/error.envelope',
    title: 'unknown endpoints return the shared machine-readable error envelope',
    async run(world) {
      const response = await world.guest().request('/api/v1/does-not-exist');
      expect(response.status).toBe(404);
      const body = apiErrorSchema.parse(await response.json());
      expect(body.code).toBe('not_found');
      expect(body.requestId.length).toBeGreaterThan(0);
    },
  },
  {
    contract: 'api/request-id.correlation',
    title: 'the x-request-id header is echoed when supplied and generated when absent',
    async run(world) {
      const supplied = await world
        .guest()
        .request('/api/v1/bootstrap/status', { headers: { 'x-request-id': 'conformance-rid-1' } });
      expect(supplied.headers.get('x-request-id')).toBe('conformance-rid-1');
      const generated = await world.guest().request('/api/v1/bootstrap/status');
      expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    },
  },
  {
    contract: 'api/headers.contract-identity',
    title: 'API responses carry product/contract version headers and are never cached',
    async run(world) {
      const response = await world.guest().request('/api/v1/bootstrap/status');
      expect(response.headers.get('x-apiarylens-version')).toBe(PRODUCT_VERSION);
      expect(response.headers.get('x-api-contract-version')).toBe(API_CONTRACT_VERSION);
      expect(response.headers.get('cache-control')).toBe('no-store');
    },
  },
  {
    contract: 'api/bootstrap.single-owner-lifecycle',
    title: 'first-owner bootstrap opens once, returns a session view, then closes forever',
    async run(world) {
      const guest = world.guest();
      const before = await readJson<{ available: boolean }>(
        await guest.request('/api/v1/bootstrap/status'),
      );
      expect(before.available).toBe(true);

      const body = await guest.bootstrapOwner();
      sessionViewSchema.parse(body);
      expect(body.membership.role).toBe('owner');
      expect(body.recoveryCodes).toHaveLength(8);
      for (const code of body.recoveryCodes) expect(code.length).toBeGreaterThanOrEqual(16);

      const after = await readJson<{ available: boolean }>(
        await guest.request('/api/v1/bootstrap/status'),
      );
      expect(after.available).toBe(false);

      const second = await world.guest().request('/api/v1/bootstrap', {
        json: { ...OWNER, identifier: 'second@conformance.test' },
      });
      expect(second.status).toBe(409);
      expect(await readErrorCode(second)).toBe('bootstrap_closed');
    },
  },
  {
    contract: 'api/bootstrap.validation',
    title: 'malformed bootstrap requests fail with validation_failed',
    async run(world) {
      const response = await world.guest().request('/api/v1/bootstrap', {
        json: { ...OWNER, password: 'short' },
      });
      expect(response.status).toBe(400);
      expect(await readErrorCode(response)).toBe('validation_failed');
    },
  },
  {
    contract: 'api/auth.session-cookie',
    title: 'sign-in issues the hardened __Host- session cookie and a session view',
    async run(world) {
      await world.owner();
      const actor = world.guest();
      const response = await actor.signIn(OWNER.identifier, OWNER.password);
      expect(response.status).toBe(200);
      sessionViewSchema.parse(await response.json());
      const setCookie = response.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(`${SESSION_COOKIE}=`);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/Secure/i);
      expect(setCookie).toMatch(/SameSite=Strict/i);
      expect(setCookie).toMatch(/Path=\//i);
    },
  },
  {
    contract: 'api/auth.invalid-credentials',
    title: 'wrong passwords and unknown identifiers fail identically without enumeration',
    async run(world) {
      await world.owner();
      const wrongPassword = await world.guest().request('/api/v1/auth/sign-in', {
        json: { identifier: OWNER.identifier, password: 'incorrect password entirely' },
      });
      const unknownUser = await world.guest().request('/api/v1/auth/sign-in', {
        json: { identifier: 'nobody@conformance.test', password: 'incorrect password entirely' },
      });
      for (const response of [wrongPassword, unknownUser]) {
        expect(response.status).toBe(401);
        expect(await readErrorCode(response)).toBe('invalid_credentials');
      }
    },
  },
  {
    contract: 'api/auth.throttle-lockout',
    title: 'five failed sign-ins lock the identifier even for the correct password',
    async run(world) {
      await world.owner();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const failed = await world.guest().request('/api/v1/auth/sign-in', {
          json: { identifier: OWNER.identifier, password: 'incorrect password entirely' },
        });
        expect(failed.status).toBe(401);
      }
      const locked = await world.guest().request('/api/v1/auth/sign-in', {
        json: { identifier: OWNER.identifier, password: OWNER.password },
      });
      expect(locked.status).toBe(401);
      expect(await readErrorCode(locked)).toBe('invalid_credentials');
    },
  },
  {
    contract: 'api/session.rotation',
    title: 'reading the session rotates the opaque token and invalidates the previous one',
    async run(world) {
      const owner = await world.owner();
      const previousCookie = owner.cookie;
      const response = await owner.refreshSession();
      expect(response.status).toBe(200);
      sessionViewSchema.parse(await response.json());
      expect(owner.cookie).not.toBe(previousCookie);

      const stale = await world.backend.request('/api/v1/session', {
        headers: { cookie: previousCookie },
      });
      expect(stale.status).toBe(401);
      const current = await owner.request('/api/v1/session');
      expect(current.status).toBe(200);
    },
  },
  {
    contract: 'api/session.sign-out',
    title: 'sign-out requires CSRF, revokes the session, and clears the cookie',
    async run(world) {
      const owner = await world.owner();
      const cookie = owner.cookie;
      const response = await owner.request('/api/v1/auth/sign-out', { method: 'POST' });
      expect(response.status).toBe(204);
      const revoked = await world.backend.request('/api/v1/session', { headers: { cookie } });
      expect(revoked.status).toBe(401);
      expect(await readErrorCode(revoked)).toBe('session_expired');
    },
  },
  {
    contract: 'api/session.revoke-others',
    title: 'revoke-others ends every other device session while preserving the current one',
    async run(world) {
      const owner = await world.owner();
      const otherDevice = world.guest();
      await otherDevice.signIn(OWNER.identifier, OWNER.password);

      const response = await owner.request('/api/v1/session/revoke-others', { method: 'POST' });
      expect(response.status).toBe(200);
      expect(await readJson<{ revoked: number }>(response)).toEqual({ revoked: 1 });

      expect((await otherDevice.request('/api/v1/session', { csrf: false })).status).toBe(401);
      expect((await owner.request('/api/v1/session')).status).toBe(200);
    },
  },
  {
    contract: 'api/auth.recovery-codes',
    title: 'a recovery code replaces the password once and revokes existing sessions',
    async run(world) {
      const owner = await world.owner();
      const codes = await world.ownerRecoveryCodes();
      const newPassword = 'replacement password for recovery';
      const recover = await world.guest().request('/api/v1/auth/recover', {
        json: {
          identifier: OWNER.identifier,
          recoveryCode: codes[0],
          newPassword,
        },
      });
      expect(recover.status).toBe(204);

      const oldSession = await owner.request('/api/v1/session', { csrf: false });
      expect(oldSession.status).toBe(401);

      const oldPassword = await world.guest().request('/api/v1/auth/sign-in', {
        json: { identifier: OWNER.identifier, password: OWNER.password },
      });
      expect(oldPassword.status).toBe(401);

      const replacement = await world.guest().signIn(OWNER.identifier, newPassword);
      expect(replacement.status).toBe(200);

      const reuse = await world.guest().request('/api/v1/auth/recover', {
        json: {
          identifier: OWNER.identifier,
          recoveryCode: codes[0],
          newPassword: 'yet another replacement password',
        },
      });
      expect(reuse.status).toBe(400);
      expect(await readErrorCode(reuse)).toBe('recovery_invalid');
    },
  },
  {
    contract: 'api/resources.type-validation',
    title: 'unknown resource types are rejected with resource_type_unknown',
    async run(world) {
      const owner = await world.owner();
      const response = await owner.request('/api/v1/resources/nonsense');
      expect(response.status).toBe(404);
      expect(await readErrorCode(response)).toBe('resource_type_unknown');
    },
  },
  {
    contract: 'api/resources.read-view',
    title: 'synced records are readable by list and by id with full schema fidelity',
    async run(world) {
      const owner = await world.owner();
      const create = createOperation('apiary', { ...apiaryFields });
      const [result] = await owner.mustPush([create]);
      expect(result?.status).toBe('accepted');

      const list = await readJson<{ items: Array<Record<string, unknown>> }>(
        await owner.request('/api/v1/resources/apiary'),
      );
      expect(list.items).toHaveLength(1);
      resourceSchemas.apiary.parse(list.items[0]);
      expect(list.items[0]?.name).toBe(apiaryFields.name);

      const byId = await owner.request(`/api/v1/resources/apiary/${create.entityId}`);
      expect(byId.status).toBe(200);
      resourceSchemas.apiary.parse(await byId.json());

      const missing = await owner.request(`/api/v1/resources/apiary/${create.operationId}`);
      expect(missing.status).toBe(404);
      expect(await readErrorCode(missing)).toBe('resource_not_found');
    },
  },
  {
    contract: 'api/export.complete-package',
    title: 'the full export is a portable ZIP with manifest, data, CSV, and original media',
    async run(world) {
      const owner = await world.owner();
      const bytes = jpegBytes(256, 0x41);
      const apiaryOperation = createOperation('apiary', { ...apiaryFields });
      const mediaOperation = createOperation('mediaAsset', mediaAssetFields(bytes));
      await owner.mustPush([apiaryOperation, mediaOperation]);
      const upload = await owner.request(`/api/v1/media/${mediaOperation.entityId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: bytes,
      });
      expect(upload.status).toBe(200);

      const response = await owner.request('/api/v1/export/full');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/zip');
      const files = unzipSync(new Uint8Array(await response.arrayBuffer()));

      const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as Record<string, unknown>;
      expect(manifest.product).toBe(PRODUCT_NAME);
      expect(manifest.exportFormat).toBe(1);

      const data = JSON.parse(strFromU8(files['data.json']!)) as Record<string, unknown[]>;
      for (const entityType of resourceTypeSchema.options) {
        expect(Array.isArray(data[entityType])).toBe(true);
      }
      expect(data.apiary).toHaveLength(1);
      expect(data.mediaAsset).toHaveLength(1);

      for (const entityType of ['apiary', 'hive', 'inspection'] as const) {
        expect(files[`csv/${entityType}.csv`]).toBeDefined();
      }
      const mediaEntry = Object.keys(files).find((name) =>
        name.startsWith(`media/${mediaOperation.entityId}/`),
      );
      expect(mediaEntry).toBeDefined();
      expect(Array.from(files[mediaEntry!]!)).toEqual(Array.from(bytes));
    },
  },
];
