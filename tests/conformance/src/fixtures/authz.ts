import { randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { expect } from 'vitest';
import { readErrorCode, readJson } from '../harness/actor.js';
import { apiaryFields, createOperation } from './data.js';
import type { ConformanceFixture } from './types.js';

export const authzFixtures: readonly ConformanceFixture[] = [
  {
    contract: 'authz/session.required',
    title: 'every protected surface rejects unauthenticated requests with 401',
    async run(world) {
      await world.owner();
      const guest = world.guest();
      const protectedRequests: Array<[string, string]> = [
        ['GET', '/api/v1/session'],
        ['GET', '/api/v1/members'],
        ['GET', '/api/v1/invitations'],
        ['GET', '/api/v1/sync/pull'],
        ['GET', '/api/v1/resources/apiary'],
        ['GET', '/api/v1/export/full'],
        ['GET', `/api/v1/media/${randomUUID()}/content`],
        ['POST', '/api/v1/sync/push'],
        ['POST', '/api/v1/auth/sign-out'],
        ['POST', '/api/v1/session/revoke-others'],
      ];
      for (const [method, path] of protectedRequests) {
        const response = await guest.request(path, { method });
        expect(response.status, `${method} ${path}`).toBe(401);
        expect(await readErrorCode(response), `${method} ${path}`).toBe('authentication_required');
      }
    },
  },
  {
    contract: 'authz/csrf.state-changing-requests',
    title: 'state-changing requests without a valid CSRF token fail closed with csrf_invalid',
    async run(world) {
      const owner = await world.owner();
      const mutations: Array<[string, string]> = [
        ['POST', '/api/v1/auth/sign-out'],
        ['POST', '/api/v1/session/revoke-others'],
        ['POST', '/api/v1/sync/push'],
        ['POST', '/api/v1/invitations'],
        ['PUT', `/api/v1/media/${randomUUID()}/content`],
        ['DELETE', `/api/v1/media/${randomUUID()}/content`],
      ];
      for (const [method, path] of mutations) {
        const missing = await owner.request(path, { method, csrf: false });
        expect(missing.status, `${method} ${path} without token`).toBe(403);
        expect(await readErrorCode(missing)).toBe('csrf_invalid');

        const wrong = await owner.request(path, {
          method,
          csrf: false,
          headers: { 'x-csrf-token': 'not-the-issued-token' },
        });
        expect(wrong.status, `${method} ${path} with wrong token`).toBe(403);
        expect(await readErrorCode(wrong)).toBe('csrf_invalid');
      }
      // The session itself must remain valid after the rejected attempts.
      expect((await owner.request('/api/v1/session')).status).toBe(200);
    },
  },
  {
    contract: 'authz/roles.viewer-read-only',
    title: 'a viewer can read family data but cannot mutate, invite, or export',
    async run(world) {
      const viewer = await world.member('viewer');
      const denied: Array<[string, string, Record<string, unknown> | undefined]> = [
        [
          'POST',
          '/api/v1/sync/push',
          { syncContractVersion: 1, operations: [createOperation('apiary', { ...apiaryFields })] },
        ],
        [
          'POST',
          '/api/v1/invitations',
          {
            displayName: 'Another Member',
            identifier: 'another@conformance.test',
            role: 'viewer',
            expiresInHours: 48,
          },
        ],
        ['GET', '/api/v1/invitations', undefined],
        ['GET', '/api/v1/export/full', undefined],
        ['PUT', `/api/v1/media/${randomUUID()}/content`, undefined],
        ['DELETE', `/api/v1/members/${viewer.session?.membership.id}`, undefined],
      ];
      for (const [method, path, json] of denied) {
        const response = await viewer.request(path, {
          method,
          ...(json === undefined ? {} : { json }),
        });
        expect(response.status, `${method} ${path}`).toBe(403);
        expect(await readErrorCode(response), `${method} ${path}`).toBe('permission_denied');
      }

      for (const path of ['/api/v1/members', '/api/v1/resources/apiary', '/api/v1/sync/pull']) {
        expect((await viewer.request(path)).status, path).toBe(200);
      }
    },
  },
  {
    contract: 'authz/roles.beekeeper-field-work',
    title: 'a beekeeper can record field data but cannot manage members or export',
    async run(world) {
      const beekeeper = await world.member('beekeeper');
      const [result] = await beekeeper.mustPush([createOperation('apiary', { ...apiaryFields })]);
      expect(result?.status).toBe('accepted');

      const invite = await beekeeper.request('/api/v1/invitations', {
        json: {
          displayName: 'Another Member',
          identifier: 'another@conformance.test',
          role: 'viewer',
          expiresInHours: 48,
        },
      });
      expect(invite.status).toBe(403);
      expect(await readErrorCode(invite)).toBe('permission_denied');

      const exportResponse = await beekeeper.request('/api/v1/export/full');
      expect(exportResponse.status).toBe(403);
      expect(await readErrorCode(exportResponse)).toBe('permission_denied');
    },
  },
  {
    contract: 'authz/invitations.lifecycle',
    title: 'invitations list without tokens, replace atomically, and accept exactly once',
    async run(world) {
      const owner = await world.owner();
      const created = await owner.invite('viewer');
      expect(created.token.length).toBeGreaterThanOrEqual(32);

      const pending = await readJson<{ items: Array<Record<string, unknown>> }>(
        await owner.request('/api/v1/invitations'),
      );
      expect(pending.items).toHaveLength(1);
      const listed = pending.items[0]!;
      expect(listed.role).toBe('viewer');
      expect(Object.keys(listed)).not.toContain('token');
      expect(Object.keys(listed)).not.toContain('tokenHash');
      expect(Object.keys(listed)).not.toContain('token_hash');

      const replaced = await owner.request(`/api/v1/invitations/${listed.id}/replace`, {
        method: 'POST',
      });
      expect(replaced.status).toBe(201);
      const replacement = await readJson<{ token: string }>(replaced);

      const staleAccept = await world.guest().acceptInvitation(created.token);
      expect(staleAccept.status).toBe(400);
      expect(await readErrorCode(staleAccept)).toBe('invitation_invalid');

      const member = world.guest();
      const accepted = await member.acceptInvitation(replacement.token);
      expect(accepted.status).toBe(201);
      expect(member.session?.membership.role).toBe('viewer');

      const reuse = await world.guest().acceptInvitation(replacement.token);
      expect(reuse.status).toBe(400);
      expect(await readErrorCode(reuse)).toBe('invitation_invalid');

      const members = await readJson<{ items: Array<{ role: string }> }>(
        await owner.request('/api/v1/members'),
      );
      expect(members.items).toHaveLength(2);
    },
  },
  {
    contract: 'authz/members.owner-protected',
    title: 'the family owner membership can never be removed',
    async run(world) {
      const owner = await world.owner();
      const response = await owner.request(`/api/v1/members/${owner.session?.membership.id}`, {
        method: 'DELETE',
      });
      expect(response.status).toBe(409);
      expect(await readErrorCode(response)).toBe('owner_required');
    },
  },
  {
    contract: 'authz/members.revocation-ends-sessions',
    title: 'removing a member immediately revokes that member’s sessions',
    async run(world) {
      const owner = await world.owner();
      const viewer = await world.member('viewer');
      const removed = await owner.request(`/api/v1/members/${viewer.session?.membership.id}`, {
        method: 'DELETE',
      });
      expect(removed.status).toBe(204);
      const afterwards = await viewer.request('/api/v1/session', { csrf: false });
      expect(afterwards.status).toBe(401);
    },
  },
  {
    contract: 'authz/isolation.organization-boundary',
    title: 'resources, changes, media, and exports never cross the organization boundary',
    async run(world) {
      const owner = await world.owner();
      const seed = await world.backend.seedForeignOrganization(owner.session!.user.id);

      const list = await readJson<{ items: unknown[] }>(
        await owner.request('/api/v1/resources/apiary'),
      );
      expect(list.items).toEqual([]);
      expect((await owner.request(`/api/v1/resources/apiary/${seed.apiaryId}`)).status).toBe(404);

      const pull = await readJson<{ changes: unknown[] }>(await owner.request('/api/v1/sync/pull'));
      expect(pull.changes).toEqual([]);

      expect((await owner.request(`/api/v1/media/${seed.mediaId}/content`)).status).toBe(404);
      for (const [method, body] of [
        ['PUT', seed.mediaBytes],
        ['DELETE', undefined],
      ] as const) {
        const response = await owner.request(`/api/v1/media/${seed.mediaId}/content`, {
          method,
          headers: { 'content-type': 'image/jpeg' },
          ...(body ? { body } : {}),
        });
        expect(response.status, `${method} foreign media`).toBe(404);
      }

      const crossUpdate = await owner.mustPush([
        createOperation(
          'apiary',
          { name: 'Unauthorized rename' },
          {
            entityId: seed.apiaryId,
            action: 'update',
            baseVersion: 1,
          },
        ),
      ]);
      expect(crossUpdate[0]?.status).toBe('conflict');
      const foreignValue = world.backend.readResourceValue(
        seed.organizationId,
        'apiary',
        seed.apiaryId,
      );
      expect(foreignValue?.name).toBe(seed.apiaryName);

      const exportResponse = await owner.request('/api/v1/export/full');
      expect(exportResponse.status).toBe(200);
      const files = unzipSync(new Uint8Array(await exportResponse.arrayBuffer()));
      const data = JSON.parse(strFromU8(files['data.json']!)) as {
        apiary: Array<{ id: string }>;
        mediaAsset: Array<{ id: string }>;
      };
      expect(data.apiary.some((item) => item.id === seed.apiaryId)).toBe(false);
      expect(data.mediaAsset.some((item) => item.id === seed.mediaId)).toBe(false);
      expect(Object.keys(files).some((name) => name.includes(seed.mediaId))).toBe(false);
    },
  },
  {
    contract: 'authz/operator.concealed-surface',
    title: 'operator lifecycle endpoints stay concealed as 404 without operator trust',
    async run(world) {
      const owner = await world.owner();
      for (const [method, path] of [
        ['GET', '/api/v1/operator/backup'],
        ['POST', '/api/v1/operator/restore'],
      ] as const) {
        const response = await owner.request(path, { method });
        expect(response.status, `${method} ${path}`).toBe(404);
        expect(await readErrorCode(response)).toBe('not_found');
      }
    },
  },
];
