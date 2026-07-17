/// <reference types="node" />

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import app from './index.js';

class TestD1Statement {
  private parameters: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...parameters: unknown[]) {
    this.parameters = parameters as SQLInputValue[];
    return this;
  }

  first<T>() {
    return Promise.resolve(this.statement.get(...this.parameters) as T | null);
  }

  all<T>() {
    return Promise.resolve({ results: this.statement.all(...this.parameters) as T[] });
  }

  run() {
    const result = this.statement.run(...this.parameters);
    return Promise.resolve({
      success: true,
      meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) },
    });
  }
}

class TestD1Database {
  readonly database = new DatabaseSync(':memory:');

  constructor() {
    for (const migration of [
      '0001_initial.sql',
      '0002_identity.sql',
      '0003_audit_index.sql',
      '0004_atomic_bootstrap.sql',
    ]) {
      this.database.exec(
        readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'),
      );
    }
  }

  prepare(sql: string) {
    return new TestD1Statement(this.database.prepare(sql));
  }

  async batch(statements: TestD1Statement[]) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  close() {
    this.database.close();
  }
}

class TestR2Bucket {
  readonly objects = new Map<string, Uint8Array>();

  put(key: string, value: ArrayBuffer | Uint8Array) {
    this.objects.set(
      key,
      value instanceof Uint8Array ? value.slice() : new Uint8Array(value).slice(),
    );
    return Promise.resolve();
  }

  get(key: string) {
    const value = this.objects.get(key);
    return Promise.resolve(
      value
        ? {
            body: value,
            arrayBuffer: () => Promise.resolve(value.slice().buffer),
          }
        : null,
    );
  }

  delete(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

const emptyEnvironment = (operatorToken?: string) =>
  ({
    DB: {},
    MEDIA: {},
    ...(operatorToken ? { SCOUT_OPERATOR_TOKEN: operatorToken } : {}),
  }) as never;

describe('Cloudflare build identity', () => {
  it('returns the deployed identity without allowing a stale health response to be cached', async () => {
    const response = await app.request('/health', {}, {
      DB: {},
      MEDIA: {},
      APIARYLENS_SOURCE_COMMIT: '02386ef',
      APIARYLENS_BUILD_TIME: '2026-07-17T15:47:15.000Z',
      APIARYLENS_ARTIFACT_IDENTITY: 'ApiaryLens@0.1.0-preview.1+02386ef',
    } as never);
    const body = (await response.json()) as { build: { sourceCommit: string } };
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.build.sourceCommit).toBe('02386ef');
  });
});

describe('Cloudflare session transparency', () => {
  it('revokes other devices while preserving the current opaque session', async () => {
    const db = new TestD1Database();
    const environment = {
      DB: db as unknown as D1Database,
      MEDIA: new TestR2Bucket() as unknown as R2Bucket,
      AUTH_ROOT_SECRET: 'test-authentication-root-secret-at-least-32-characters',
    };
    try {
      const bootstrap = await app.request(
        '/api/v1/bootstrap',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            identifier: 'owner@example.test',
            displayName: 'Family Owner',
            password: 'correct horse battery staple',
            organizationName: 'Owner family',
            timezone: 'America/New_York',
          }),
        },
        environment,
      );
      const owner = (await bootstrap.json()) as { csrfToken: string };
      const currentCookie = bootstrap.headers.get('set-cookie')?.split(';')[0] ?? '';
      const other = await app.request(
        '/api/v1/auth/sign-in',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            identifier: 'owner@example.test',
            password: 'correct horse battery staple',
          }),
        },
        environment,
      );
      const otherCookie = other.headers.get('set-cookie')?.split(';')[0] ?? '';
      const revoked = await app.request(
        '/api/v1/session/revoke-others',
        {
          method: 'POST',
          headers: { cookie: currentCookie, 'x-csrf-token': owner.csrfToken },
        },
        environment,
      );
      expect(revoked.status).toBe(200);
      expect(await revoked.json()).toEqual({ revoked: 1 });
      expect(
        (await app.request('/api/v1/session', { headers: { cookie: otherCookie } }, environment))
          .status,
      ).toBe(401);
      expect(
        (await app.request('/api/v1/session', { headers: { cookie: currentCookie } }, environment))
          .status,
      ).toBe(200);
    } finally {
      db.close();
    }
  });
});

describe('Cloudflare operator boundary', () => {
  for (const [method, path] of [
    ['GET', '/api/v1/operator/backup'],
    ['POST', '/api/v1/operator/restore'],
  ] as const) {
    it(`conceals ${method} ${path} when the operator token is not configured`, async () => {
      const response = await app.request(path, { method }, emptyEnvironment());
      expect(response.status).toBe(404);
      expect(((await response.json()) as { code: string }).code).toBe('not_found');
    });

    it(`conceals ${method} ${path} when the bearer token is incorrect`, async () => {
      const response = await app.request(
        path,
        { method, headers: { authorization: 'Bearer incorrect-token' } },
        emptyEnvironment('correct-token'),
      );
      expect(response.status).toBe(404);
      expect(((await response.json()) as { code: string }).code).toBe('not_found');
    });
  }

  it('rejects an invalid restore before changing persistent state', async () => {
    const response = await app.request(
      '/api/v1/operator/restore',
      {
        method: 'POST',
        headers: { authorization: 'Bearer correct-token' },
        body: new Uint8Array([1, 2, 3]),
      },
      emptyEnvironment('correct-token'),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe('backup_invalid');
  });
});

describe('Cloudflare error boundary', () => {
  it('returns a generic request-correlated error without exposing internals', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await app.request('/api/v1/bootstrap/status', {}, emptyEnvironment());
    const body = (await response.json()) as { code: string; message: string; requestId: string };

    expect(response.status).toBe(500);
    expect(body.code).toBe('internal_error');
    expect(body.message).toBe('The request could not be completed');
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toContain('first');
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});

describe('Cloudflare organization boundary', () => {
  it('keeps resources, changes, members, media, and exports inside the session family', async () => {
    const db = new TestD1Database();
    const media = new TestR2Bucket();
    const environment = {
      DB: db as unknown as D1Database,
      MEDIA: media as unknown as R2Bucket,
      AUTH_ROOT_SECRET: 'test-authentication-root-secret-at-least-32-characters',
    };

    try {
      const bootstrap = await app.request(
        '/api/v1/bootstrap',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            identifier: 'owner@example.test',
            displayName: 'Family Owner',
            password: 'correct horse battery staple',
            organizationName: 'Owner family',
            timezone: 'America/New_York',
          }),
        },
        environment,
      );
      expect(bootstrap.status).toBe(201);
      const owner = (await bootstrap.json()) as {
        user: { id: string };
        organization: { id: string };
        csrfToken: string;
      };
      const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0] ?? '';
      const foreignOrganizationId = randomUUID();
      const foreignResourceId = randomUUID();
      const foreignMediaId = randomUUID();
      const timestamp = new Date().toISOString();
      const foreignResource = {
        id: foreignResourceId,
        organizationId: foreignOrganizationId,
        name: 'Private foreign apiary',
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      const foreignMedia = {
        id: foreignMediaId,
        organizationId: foreignOrganizationId,
        hiveId: randomUUID(),
        fileName: 'foreign.jpg',
        mediaType: 'image/jpeg',
        byteSize: 4,
        sha256: 'not-needed-for-read-test',
        state: 'ready',
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      db.database
        .prepare(
          `INSERT INTO organizations(id, name, timezone, created_at, updated_at)
           VALUES (?, 'Foreign family', 'UTC', ?, ?)`,
        )
        .run(foreignOrganizationId, timestamp, timestamp);
      db.database
        .prepare(
          `INSERT INTO memberships(id, organization_id, user_id, role, status, created_at, updated_at)
           VALUES (?, ?, ?, 'viewer', 'active', ?, ?)`,
        )
        .run(randomUUID(), foreignOrganizationId, owner.user.id, timestamp, timestamp);
      for (const [type, id, value] of [
        ['apiary', foreignResourceId, foreignResource],
        ['mediaAsset', foreignMediaId, foreignMedia],
      ] as const) {
        db.database
          .prepare(
            `INSERT INTO resources(
              organization_id, entity_type, id, version, value_json, created_at, updated_at
            ) VALUES (?, ?, ?, 1, ?, ?, ?)`,
          )
          .run(foreignOrganizationId, type, id, JSON.stringify(value), timestamp, timestamp);
      }
      db.database
        .prepare(
          `INSERT INTO changes(
            organization_id, entity_type, entity_id, action, version, changed_at, value_json
          ) VALUES (?, 'apiary', ?, 'upsert', 1, ?, ?)`,
        )
        .run(foreignOrganizationId, foreignResourceId, timestamp, JSON.stringify(foreignResource));
      const foreignBytes = new Uint8Array([255, 216, 255, 1]);
      await media.put(`${foreignOrganizationId}/${foreignMediaId}`, foreignBytes);

      const headers = { cookie };
      const resourceList = (await (
        await app.request('/api/v1/resources/apiary', { headers }, environment)
      ).json()) as { items: unknown[] };
      const pull = (await (
        await app.request('/api/v1/sync/pull', { headers }, environment)
      ).json()) as { changes: unknown[] };
      const members = (await (
        await app.request('/api/v1/members', { headers }, environment)
      ).json()) as { items: unknown[] };
      expect(resourceList.items).toEqual([]);
      expect(
        (
          await app.request(
            `/api/v1/resources/apiary/${foreignResourceId}`,
            { headers },
            environment,
          )
        ).status,
      ).toBe(404);
      expect(pull.changes).toEqual([]);
      expect(
        (await app.request(`/api/v1/media/${foreignMediaId}/content`, { headers }, environment))
          .status,
      ).toBe(404);
      for (const [method, path, body] of [
        ['PUT', `/api/v1/media/${foreignMediaId}/content`, foreignBytes],
        ['PUT', `/api/v1/media/${foreignMediaId}/thumbnail`, foreignBytes],
        ['DELETE', `/api/v1/media/${foreignMediaId}/content`, undefined],
      ] as const) {
        expect(
          (
            await app.request(
              path,
              {
                method,
                headers: {
                  ...headers,
                  'content-type': 'image/jpeg',
                  'x-csrf-token': owner.csrfToken,
                },
                ...(body ? { body } : {}),
              },
              environment,
            )
          ).status,
        ).toBe(404);
      }
      expect(media.objects.get(`${foreignOrganizationId}/${foreignMediaId}`)).toEqual(foreignBytes);
      const crossFamilyUpdate = await app.request(
        '/api/v1/sync/push',
        {
          method: 'POST',
          headers: {
            ...headers,
            'content-type': 'application/json',
            'x-csrf-token': owner.csrfToken,
          },
          body: JSON.stringify({
            syncContractVersion: 1,
            operations: [
              {
                operationId: randomUUID(),
                clientId: randomUUID(),
                entityType: 'apiary',
                entityId: foreignResourceId,
                action: 'update',
                baseVersion: 1,
                payload: { name: 'Unauthorized change' },
                queuedAt: timestamp,
              },
            ],
          }),
        },
        environment,
      );
      const crossFamilyResult = (await crossFamilyUpdate.json()) as {
        results: Array<{ status: string }>;
      };
      expect(crossFamilyResult.results[0]?.status).toBe('conflict');
      expect(
        JSON.parse(
          String(
            (
              db.database
                .prepare(
                  `SELECT value_json FROM resources
                   WHERE organization_id = ? AND entity_type = 'apiary' AND id = ?`,
                )
                .get(foreignOrganizationId, foreignResourceId) as { value_json: string }
            ).value_json,
          ),
        ).name,
      ).toBe('Private foreign apiary');
      expect(members.items).toHaveLength(1);

      const exportResponse = await app.request('/api/v1/export/full', { headers }, environment);
      expect(exportResponse.status).toBe(200);
      const files = unzipSync(new Uint8Array(await exportResponse.arrayBuffer()));
      const exported = JSON.parse(strFromU8(files['data.json']!)) as {
        apiary: Array<{ id: string }>;
        mediaAsset: Array<{ id: string }>;
      };
      expect(exported.apiary.some((item) => item.id === foreignResourceId)).toBe(false);
      expect(exported.mediaAsset.some((item) => item.id === foreignMediaId)).toBe(false);
      expect(files[`media/${foreignMediaId}/foreign.jpg`]).toBeUndefined();
      expect(owner.organization.id).not.toBe(foreignOrganizationId);

      db.database
        .prepare("UPDATE memberships SET status = 'revoked' WHERE organization_id = ?")
        .run(owner.organization.id);
      expect((await app.request('/api/v1/session', { headers }, environment)).status).toBe(401);
    } finally {
      db.close();
    }
  });

  it('manages pending invitations and removes a non-owner across the Cloudflare profile', async () => {
    const db = new TestD1Database();
    const environment = {
      DB: db as unknown as D1Database,
      MEDIA: new TestR2Bucket() as unknown as R2Bucket,
      AUTH_ROOT_SECRET: 'test-authentication-root-secret-at-least-32-characters',
    };
    try {
      const bootstrap = await app.request(
        '/api/v1/bootstrap',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            identifier: 'manager@example.test',
            displayName: 'Family Manager',
            password: 'correct horse battery staple',
            organizationName: 'Managed family',
            timezone: 'America/New_York',
          }),
        },
        environment,
      );
      const owner = (await bootstrap.json()) as { csrfToken: string };
      const ownerCookie = bootstrap.headers.get('set-cookie')?.split(';')[0] ?? '';
      const ownerHeaders = {
        cookie: ownerCookie,
        'content-type': 'application/json',
        'x-csrf-token': owner.csrfToken,
      };
      const created = await app.request(
        '/api/v1/invitations',
        {
          method: 'POST',
          headers: ownerHeaders,
          body: JSON.stringify({
            displayName: 'Family Viewer',
            identifier: 'managed-viewer@example.test',
            role: 'viewer',
            expiresInHours: 48,
          }),
        },
        environment,
      );
      expect(created.status).toBe(201);
      const pending = (await (
        await app.request('/api/v1/invitations', { headers: { cookie: ownerCookie } }, environment)
      ).json()) as { items: Array<{ id: string }> };
      expect(pending.items).toHaveLength(1);

      const replaced = await app.request(
        `/api/v1/invitations/${pending.items[0]!.id}/replace`,
        { method: 'POST', headers: ownerHeaders },
        environment,
      );
      expect(replaced.status).toBe(201);
      const replacementToken = String(((await replaced.json()) as { token: string }).token);
      const replacedPending = (await (
        await app.request('/api/v1/invitations', { headers: { cookie: ownerCookie } }, environment)
      ).json()) as { items: Array<{ id: string }> };
      expect(replacedPending.items[0]?.id).not.toBe(pending.items[0]?.id);

      const accepted = await app.request(
        '/api/v1/invitations/accept',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: replacementToken,
            password: 'viewer password is sufficiently long',
          }),
        },
        environment,
      );
      expect(accepted.status).toBe(201);
      const viewer = (await accepted.json()) as { membership: { id: string } };
      const viewerCookie = accepted.headers.get('set-cookie')?.split(';')[0] ?? '';
      expect(
        (
          (await (
            await app.request('/api/v1/members', { headers: { cookie: ownerCookie } }, environment)
          ).json()) as { items: unknown[] }
        ).items,
      ).toHaveLength(2);

      const removed = await app.request(
        `/api/v1/members/${viewer.membership.id}`,
        { method: 'DELETE', headers: ownerHeaders },
        environment,
      );
      expect(removed.status).toBe(204);
      expect(
        (await app.request('/api/v1/session', { headers: { cookie: viewerCookie } }, environment))
          .status,
      ).toBe(401);
    } finally {
      db.close();
    }
  });
});
