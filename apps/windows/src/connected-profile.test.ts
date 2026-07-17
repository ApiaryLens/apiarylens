import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
    productVersion: '0.1.0-preview.1',
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
              productVersion: '0.1.0-preview.1',
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
    expect((await verifyConnectedBackend(profile)).productVersion).toBe('0.1.0-preview.1');
    const mismatch = { ...profile, compatibility: { ...profile.compatibility, syncContract: 2 } };
    await expect(verifyConnectedBackend(mismatch)).rejects.toThrow(/compatibility lock/);
  });
});
