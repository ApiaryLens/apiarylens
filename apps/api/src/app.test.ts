import { createHash, pbkdf2Sync, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteStore } from '@apiarylens/database';
import { MemoryMediaStore } from '@apiarylens/media';
import { strFromU8, unzipSync } from 'fflate';
import { createApi } from './app.js';

describe('ApiaryLens API', () => {
  let store: SqliteStore;
  let mediaStore: MemoryMediaStore;
  let app: ReturnType<typeof createApi>;

  beforeEach(() => {
    store = new SqliteStore();
    mediaStore = new MemoryMediaStore();
    app = createApi({ store, mediaStore, secureCookies: false });
  });

  afterEach(() => store.close());

  async function bootstrap() {
    const response = await app.request('/api/v1/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'owner@example.test',
        displayName: 'Apiary Owner',
        password: 'correct horse battery staple',
        organizationName: 'Turner Apiary',
        timezone: 'America/New_York',
      }),
    });
    const body = (await response.json()) as {
      csrfToken: string;
      recoveryCodes: string[];
      user: { id: string };
      organization: { id: string };
      membership: { id: string };
    };
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Session cookie missing');
    return { response, body, cookie };
  }

  it('bootstraps an owner and returns a hardened session cookie', async () => {
    const { response, body } = await bootstrap();
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Strict');
    expect(body.csrfToken.length).toBeGreaterThan(32);

    const second = await app.request('/api/v1/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'second@example.test',
        displayName: 'Second Owner',
        password: 'correct horse battery staple',
        organizationName: 'Other Apiary',
        timezone: 'UTC',
      }),
    });
    expect(second.status).toBe(409);
  });

  it('protects first-owner bootstrap when a deployment code is configured', async () => {
    const protectedStore = new SqliteStore();
    const protectedApi = createApi({
      store: protectedStore,
      secureCookies: false,
      bootstrapToken: 'deployment-code-with-enough-entropy',
    });
    const payload = {
      identifier: 'protected-owner@example.test',
      displayName: 'Protected Owner',
      password: 'correct horse battery staple',
      organizationName: 'Protected Apiary',
      timezone: 'UTC',
    };
    const status = await protectedApi.request('/api/v1/bootstrap/status');
    expect(await status.json()).toMatchObject({ available: true, requiresToken: true });
    const rejected = await protectedApi.request('/api/v1/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, bootstrapToken: 'incorrect-deployment-code' }),
    });
    expect(rejected.status).toBe(403);
    const accepted = await protectedApi.request('/api/v1/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        bootstrapToken: 'deployment-code-with-enough-entropy',
      }),
    });
    expect(accepted.status).toBe(201);
    protectedStore.close();
  });

  it('throttles repeated bootstrap-code guesses by deployment address', async () => {
    const throttledStore = new SqliteStore();
    const throttledApi = createApi({
      store: throttledStore,
      secureCookies: false,
      bootstrapToken: 'deployment-code-with-enough-entropy',
    });
    const payload = {
      identifier: 'throttled-owner@example.test',
      displayName: 'Throttled Owner',
      password: 'correct horse battery staple',
      organizationName: 'Protected Apiary',
      timezone: 'UTC',
      bootstrapToken: 'incorrect-deployment-code',
    };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rejected = await throttledApi.request('/api/v1/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.10' },
        body: JSON.stringify(payload),
      });
      expect(rejected.status).toBe(403);
    }
    const limited = await throttledApi.request('/api/v1/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.10' },
      body: JSON.stringify({
        ...payload,
        bootstrapToken: 'deployment-code-with-enough-entropy',
      }),
    });
    expect(limited.status).toBe(429);
    throttledStore.close();
  });

  it('publishes OpenAPI without requiring authentication', async () => {
    const response = await app.request('/api/v1/openapi.json');
    expect(response.status).toBe(200);
    expect(((await response.json()) as { openapi: string }).openapi).toBe('3.1.0');
  });

  it('requires CSRF and deduplicates synchronized writes', async () => {
    const { body, cookie } = await bootstrap();
    const operation = {
      operationId: randomUUID(),
      clientId: randomUUID(),
      entityType: 'apiary',
      entityId: randomUUID(),
      action: 'create',
      baseVersion: 0,
      payload: { name: 'Back field' },
      queuedAt: new Date().toISOString(),
    };
    const withoutCsrf = await app.request('/api/v1/sync/push', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ syncContractVersion: 1, operations: [operation] }),
    });
    expect(withoutCsrf.status).toBe(403);

    const push = () =>
      app.request('/api/v1/sync/push', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          'x-csrf-token': body.csrfToken,
        },
        body: JSON.stringify({ syncContractVersion: 1, operations: [operation] }),
      });
    const first = await push();
    const second = await push();
    expect(first.status).toBe(200);
    expect((await first.json()).results[0].status).toBe('accepted');
    expect((await second.json()).results[0].status).toBe('duplicate');
  });

  it('scopes resource lookup to the authenticated organization', async () => {
    const { cookie } = await bootstrap();
    const response = await app.request(`/api/v1/resources/apiary/${randomUUID()}`, {
      headers: { cookie },
    });
    expect(response.status).toBe(404);
  });

  it('keeps resource, change, media, member, and export data inside the session organization', async () => {
    const owner = await bootstrap();
    const otherOrganizationId = randomUUID();
    const otherApiaryId = randomUUID();
    const otherMediaId = randomUUID();
    const timestamp = new Date().toISOString();
    store.database
      .prepare(
        `INSERT INTO organizations(id, name, timezone, created_at, updated_at)
         VALUES (?, 'Other family', 'UTC', ?, ?)`,
      )
      .run(otherOrganizationId, timestamp, timestamp);
    store.applyOperation(otherOrganizationId, owner.body.user.id, {
      operationId: randomUUID(),
      clientId: randomUUID(),
      entityType: 'apiary',
      entityId: otherApiaryId,
      action: 'create',
      baseVersion: 0,
      payload: { name: 'Private other apiary' },
      queuedAt: timestamp,
    });
    const foreignBytes = new Uint8Array([0xff, 0xd8, 0xff, 1]);
    store.applyOperation(otherOrganizationId, owner.body.user.id, {
      operationId: randomUUID(),
      clientId: randomUUID(),
      entityType: 'mediaAsset',
      entityId: otherMediaId,
      action: 'create',
      baseVersion: 0,
      payload: {
        hiveId: randomUUID(),
        fileName: 'other-family.jpg',
        mediaType: 'image/jpeg',
        byteSize: foreignBytes.byteLength,
        sha256: createHash('sha256').update(foreignBytes).digest('hex'),
        state: 'ready',
      },
      queuedAt: timestamp,
    });
    await mediaStore.put(otherOrganizationId, otherMediaId, foreignBytes);
    store.database
      .prepare(
        `INSERT INTO memberships(
          id, organization_id, user_id, role, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'viewer', 'active', ?, ?)`,
      )
      .run(randomUUID(), otherOrganizationId, owner.body.user.id, timestamp, timestamp);

    const headers = { cookie: owner.cookie };
    const list = await app.request('/api/v1/resources/apiary', { headers });
    expect((await list.json()).items).toEqual([]);
    expect(
      (await app.request(`/api/v1/resources/apiary/${otherApiaryId}`, { headers })).status,
    ).toBe(404);
    const changes = await app.request('/api/v1/sync/pull', { headers });
    expect((await changes.json()).changes).toEqual([]);
    expect((await app.request(`/api/v1/media/${otherMediaId}/content`, { headers })).status).toBe(
      404,
    );
    for (const [method, path, body] of [
      ['PUT', `/api/v1/media/${otherMediaId}/content`, foreignBytes],
      ['PUT', `/api/v1/media/${otherMediaId}/thumbnail`, foreignBytes],
      ['DELETE', `/api/v1/media/${otherMediaId}/content`, undefined],
    ] as const) {
      expect(
        (
          await app.request(path, {
            method,
            headers: {
              ...headers,
              'content-type': 'image/jpeg',
              'x-csrf-token': owner.body.csrfToken,
            },
            ...(body ? { body } : {}),
          })
        ).status,
      ).toBe(404);
    }
    expect(await mediaStore.get(otherOrganizationId, otherMediaId)).toEqual(foreignBytes);
    const crossFamilyUpdate = await app.request('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'x-csrf-token': owner.body.csrfToken,
      },
      body: JSON.stringify({
        syncContractVersion: 1,
        operations: [
          {
            operationId: randomUUID(),
            clientId: randomUUID(),
            entityType: 'apiary',
            entityId: otherApiaryId,
            action: 'update',
            baseVersion: 1,
            payload: { name: 'Unauthorized change' },
            queuedAt: timestamp,
          },
        ],
      }),
    });
    expect((await crossFamilyUpdate.json()).results[0].status).toBe('conflict');
    expect(store.getResource(otherOrganizationId, 'apiary', otherApiaryId)?.name).toBe(
      'Private other apiary',
    );
    const members = await app.request('/api/v1/members', { headers });
    expect((await members.json()).items).toHaveLength(1);

    const archive = await app.request('/api/v1/export/full', { headers });
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const exported = JSON.parse(strFromU8(files['data.json']!)) as {
      apiary: Array<{ id: string }>;
      mediaAsset: Array<{ id: string }>;
    };
    expect(exported.apiary.some((item) => item.id === otherApiaryId)).toBe(false);
    expect(exported.mediaAsset.some((item) => item.id === otherMediaId)).toBe(false);
    expect(files[`media/${otherMediaId}/other-family.jpg`]).toBeUndefined();
  });

  it('signs in with a password without exposing credentials to browser storage', async () => {
    await bootstrap();
    const salt = Buffer.alloc(16, 11);
    const legacy = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(
      'correct horse battery staple',
      salt,
      100_000,
      32,
      'sha256',
    ).toString('base64url')}`;
    store.database.prepare('UPDATE users SET password_hash = ?').run(legacy);
    const response = await app.request('/api/v1/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'owner@example.test',
        password: 'correct horse battery staple',
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    const upgraded = store.database.prepare('SELECT password_hash FROM users').get() as {
      password_hash: string;
    };
    expect(upgraded.password_hash).toMatch(/^pbkdf2-sha256-v2\$/);
  });

  it('rejects an existing session after its membership is revoked', async () => {
    const owner = await bootstrap();
    store.database
      .prepare("UPDATE memberships SET status = 'revoked' WHERE id = ?")
      .run(owner.body.membership.id);

    const response = await app.request('/api/v1/session', {
      headers: { cookie: owner.cookie },
    });
    expect(response.status).toBe(401);
  });

  it('rotates the opaque session identifier when refreshing a session', async () => {
    const owner = await bootstrap();
    const refreshed = await app.request('/api/v1/session', {
      headers: { cookie: owner.cookie },
    });
    expect(refreshed.status).toBe(200);
    const nextCookie = refreshed.headers.get('set-cookie')?.split(';')[0];
    expect(nextCookie).toBeTruthy();
    expect(nextCookie).not.toBe(owner.cookie);
    expect(
      (await app.request('/api/v1/session', { headers: { cookie: owner.cookie } })).status,
    ).toBe(401);
    expect(
      (await app.request('/api/v1/session', { headers: { cookie: nextCookie! } })).status,
    ).toBe(200);
  });

  it('enrolls a viewer who cannot write protected records', async () => {
    const owner = await bootstrap();
    const invitationResponse = await app.request('/api/v1/invitations', {
      method: 'POST',
      headers: {
        cookie: owner.cookie,
        'content-type': 'application/json',
        'x-csrf-token': owner.body.csrfToken,
      },
      body: JSON.stringify({
        displayName: 'Family Viewer',
        identifier: 'viewer@example.test',
        role: 'viewer',
        expiresInHours: 48,
      }),
    });
    expect(invitationResponse.status).toBe(201);
    const invitation = (await invitationResponse.json()) as { token: string };
    const acceptResponse = await app.request('/api/v1/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: invitation.token, password: 'viewer password is long enough' }),
    });
    expect(acceptResponse.status).toBe(201);
    const viewer = (await acceptResponse.json()) as { csrfToken: string };
    const viewerCookie = acceptResponse.headers.get('set-cookie')?.split(';')[0] ?? '';
    const denied = await app.request('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        cookie: viewerCookie,
        'content-type': 'application/json',
        'x-csrf-token': viewer.csrfToken,
      },
      body: JSON.stringify({
        syncContractVersion: 1,
        operations: [
          {
            operationId: randomUUID(),
            clientId: randomUUID(),
            entityType: 'apiary',
            entityId: randomUUID(),
            action: 'create',
            baseVersion: 0,
            payload: { name: 'Forbidden apiary' },
            queuedAt: new Date().toISOString(),
          },
        ],
      }),
    });
    expect(denied.status).toBe(403);
    expect(
      (
        await app.request('/api/v1/invitations', {
          method: 'POST',
          headers: {
            cookie: viewerCookie,
            'content-type': 'application/json',
            'x-csrf-token': viewer.csrfToken,
          },
          body: JSON.stringify({
            displayName: 'Unauthorized member',
            identifier: 'unauthorized@example.test',
            role: 'viewer',
            expiresInHours: 48,
          }),
        })
      ).status,
    ).toBe(403);
    expect(
      (await app.request('/api/v1/export/full', { headers: { cookie: viewerCookie } })).status,
    ).toBe(403);
    expect(
      (
        await app.request(`/api/v1/media/${randomUUID()}/content`, {
          method: 'DELETE',
          headers: { cookie: viewerCookie, 'x-csrf-token': viewer.csrfToken },
        })
      ).status,
    ).toBe(403);
  });

  it('consumes a one-time recovery code and revokes prior sessions', async () => {
    const owner = await bootstrap();
    const recovery = await app.request('/api/v1/auth/recover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'owner@example.test',
        recoveryCode: owner.body.recoveryCodes[0],
        newPassword: 'a completely different secure password',
      }),
    });
    expect(recovery.status).toBe(204);
    expect(
      (
        await app.request('/api/v1/session', {
          headers: { cookie: owner.cookie },
        })
      ).status,
    ).toBe(401);

    const reuse = await app.request('/api/v1/auth/recover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'owner@example.test',
        recoveryCode: owner.body.recoveryCodes[0],
        newPassword: 'yet another completely secure password',
      }),
    });
    expect(reuse.status).toBe(400);
  });

  it('validates, stores, and authorizes private image content', async () => {
    const owner = await bootstrap();
    const mediaId = randomUUID();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const metadata = {
      operationId: randomUUID(),
      clientId: randomUUID(),
      entityType: 'mediaAsset',
      entityId: mediaId,
      action: 'create',
      baseVersion: 0,
      payload: {
        hiveId: randomUUID(),
        fileName: 'inspection.jpg',
        mediaType: 'image/jpeg',
        byteSize: bytes.byteLength,
        sha256: digest,
        state: 'staged',
      },
      queuedAt: new Date().toISOString(),
    };
    const metadataResponse = await app.request('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        cookie: owner.cookie,
        'content-type': 'application/json',
        'x-csrf-token': owner.body.csrfToken,
      },
      body: JSON.stringify({ syncContractVersion: 1, operations: [metadata] }),
    });
    expect(metadataResponse.status).toBe(200);

    const upload = await app.request(`/api/v1/media/${mediaId}/content`, {
      method: 'PUT',
      headers: {
        cookie: owner.cookie,
        'content-type': 'image/jpeg',
        'x-csrf-token': owner.body.csrfToken,
      },
      body: bytes,
    });
    expect(upload.status).toBe(200);
    const uploaded = (await upload.json()) as { state: string; version: number };
    expect(uploaded.state).toBe('ready');

    const thumbnailBytes = new Uint8Array([0xff, 0xd8, 1, 2, 3]);
    const thumbnailUpload = await app.request(`/api/v1/media/${mediaId}/thumbnail`, {
      method: 'PUT',
      headers: {
        cookie: owner.cookie,
        'content-type': 'image/jpeg',
        'x-csrf-token': owner.body.csrfToken,
      },
      body: thumbnailBytes,
    });
    expect(thumbnailUpload.status).toBe(204);

    const download = await app.request(`/api/v1/media/${mediaId}/content`, {
      headers: { cookie: owner.cookie },
    });
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
    const thumbnail = await app.request(`/api/v1/media/${mediaId}/content?variant=thumbnail`, {
      headers: { cookie: owner.cookie },
    });
    expect(new Uint8Array(await thumbnail.arrayBuffer())).toEqual(thumbnailBytes);
    expect((await app.request(`/api/v1/media/${mediaId}/content`)).status).toBe(401);

    const exportResponse = await app.request('/api/v1/export/full', {
      headers: { cookie: owner.cookie },
    });
    expect(exportResponse.status).toBe(200);
    const files = unzipSync(new Uint8Array(await exportResponse.arrayBuffer()));
    expect(files['manifest.json']).toBeDefined();
    expect(JSON.parse(strFromU8(files['manifest.json']!)).exportFormat).toBe(1);
    expect(files[`media/${mediaId}/inspection.jpg`]).toEqual(bytes);

    const deletion = await app.request('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        cookie: owner.cookie,
        'content-type': 'application/json',
        'x-csrf-token': owner.body.csrfToken,
      },
      body: JSON.stringify({
        syncContractVersion: 1,
        operations: [
          {
            ...metadata,
            operationId: randomUUID(),
            action: 'delete',
            baseVersion: uploaded.version,
            payload: null,
          },
        ],
      }),
    });
    expect(deletion.status).toBe(200);
    expect(
      (await app.request(`/api/v1/media/${mediaId}/content`, { headers: { cookie: owner.cookie } }))
        .status,
    ).toBe(404);
  });
});
