import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkConnectedBackend,
  compareBackendIdentity,
  describeConnectionProfile,
  loadSavedConnectionProfile,
  parseConnectionProfile,
  saveConnectionProfile,
  verifyConnectedBackend,
  type WindowsConnectionProfile,
} from './connected-profile.js';

const profile: WindowsConnectionProfile = {
  schemaVersion: 1,
  profileId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Turner family cloud',
  mode: 'connected',
  clientKind: 'windows',
  backendUrl: 'https://hives.example.test',
  deploymentProfile: 'cloudflare',
  provisioningSource: 'scout',
  createdAt: '2026-07-17T16:00:00.000Z',
  compatibility: {
    productVersion: '0.1.0-preview.3',
    apiContract: '1.0',
    syncContract: 1,
    databaseMigration: '0004',
  },
};

describe('Windows connected profile', () => {
  const roots: string[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('accepts only a secret-free exact HTTPS origin', () => {
    expect(parseConnectionProfile(profile).backendUrl).toBe('https://hives.example.test');
    expect(() =>
      parseConnectionProfile({ ...profile, backendUrl: 'http://hives.example.test' }),
    ).toThrow(/HTTPS/);
    const credentialedOrigin = new URL('https://hives.example.test');
    credentialedOrigin.username = 'user';
    credentialedOrigin.password = 'secret';
    expect(() =>
      parseConnectionProfile({ ...profile, backendUrl: credentialedOrigin.href }),
    ).toThrow(/HTTPS/);
    expect(() => parseConnectionProfile({ ...profile, apiToken: 'must-not-be-here' })).toThrow(
      /unsupported/,
    );
  });

  it('atomically persists and reloads the non-secret compatibility lock', () => {
    const root = mkdtempSync(join(tmpdir(), 'apiarylens-connected-profile-'));
    roots.push(root);
    const path = join(root, 'connection-profile.v1.json');
    saveConnectionProfile(path, profile);
    expect(loadSavedConnectionProfile(path)).toEqual(profile);
    expect(readFileSync(path, 'utf8')).not.toContain('token');
  });

  it('requires the remote health identity to match the imported lock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const response = new Response(
          JSON.stringify({
            status: 'ok',
            build: {
              product: 'ApiaryLens',
              productVersion: '0.1.0-preview.3',
              deploymentProfile: 'cloudflare',
              apiContract: '1.0',
              syncContract: 1,
              databaseMigration: '0004',
            },
          }),
          { status: 200 },
        );
        Object.defineProperty(response, 'url', { value: `${profile.backendUrl}/health` });
        return Promise.resolve(response);
      }),
    );
    expect((await verifyConnectedBackend(profile)).productVersion).toBe('0.1.0-preview.3');
    const mismatch = { ...profile, compatibility: { ...profile.compatibility, syncContract: 2 } };
    await expect(verifyConnectedBackend(mismatch)).rejects.toThrow(/compatibility lock/);
  });

  it('describes the profile for import preview without inventing secret fields', () => {
    const rows = describeConnectionProfile(profile);
    expect(rows).toContainEqual(['Family server', 'Turner family cloud']);
    expect(rows).toContainEqual(['Server address', 'https://hives.example.test']);
    expect(rows).toContainEqual(['Deployment profile', 'Cloudflare']);
    expect(rows).toContainEqual(['Profile source', 'Scout Bee']);
    expect(rows).toContainEqual(['Sync contract', '1']);
    expect(JSON.stringify(rows)).not.toMatch(/token|secret|password/i);
  });

  it('names every identity field that differs from the compatibility lock', () => {
    const matchingBuild = {
      product: 'ApiaryLens',
      productVersion: '0.1.0-preview.3',
      deploymentProfile: 'cloudflare',
      apiContract: '1.0',
      syncContract: 1,
      databaseMigration: '0004',
    } as const;
    expect(compareBackendIdentity(profile, { status: 'ok', build: matchingBuild })).toEqual([]);
    expect(compareBackendIdentity(profile, { status: 'degraded', build: matchingBuild })).toEqual([
      'The server did not report a healthy identity',
    ]);
    const drifted = compareBackendIdentity(profile, {
      status: 'ok',
      build: { ...matchingBuild, productVersion: '0.1.0-preview.2', syncContract: 2 },
    });
    expect(drifted).toHaveLength(2);
    expect(drifted[0]).toContain('profile requires 0.1.0-preview.3');
    expect(drifted[0]).toContain('server reports 0.1.0-preview.2');
    expect(drifted[1]).toContain('Sync contract');
  });

  it('reports matched, mismatch, and unreachable identity checks without throwing', async () => {
    const respond = (body: unknown) => {
      const response = new Response(JSON.stringify(body), { status: 200 });
      Object.defineProperty(response, 'url', { value: `${profile.backendUrl}/health` });
      return Promise.resolve(response);
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        respond({
          status: 'ok',
          build: {
            product: 'ApiaryLens',
            productVersion: '0.1.0-preview.3',
            deploymentProfile: 'cloudflare',
            apiContract: '1.0',
            syncContract: 1,
            databaseMigration: '0004',
          },
        }),
      ),
    );
    const matched = await checkConnectedBackend(profile);
    expect(matched.state).toBe('matched');
    if (matched.state === 'matched') expect(matched.build.productVersion).toBe('0.1.0-preview.3');

    const drifted = { ...profile, compatibility: { ...profile.compatibility, apiContract: '2.0' } };
    const mismatch = await checkConnectedBackend(drifted);
    expect(mismatch.state).toBe('mismatch');
    if (mismatch.state === 'mismatch') {
      expect(mismatch.problems.some((problem) => problem.includes('API contract'))).toBe(true);
    }

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const unreachable = await checkConnectedBackend(profile);
    expect(unreachable.state).toBe('unreachable');
  });
});
