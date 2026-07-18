import { describe, expect, it, vi } from 'vitest';
import type { BuildIdentity } from '@apiarylens/contracts';
import type { ConnectedIdentityCheck, WindowsConnectionProfile } from './connected-profile.js';
import { ConnectedImportSession } from './first-run-import.js';

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

const matched: ConnectedIdentityCheck = {
  state: 'matched',
  build: {
    product: 'ApiaryLens',
    productVersion: '0.1.0-preview.3',
    deploymentProfile: 'cloudflare',
    apiContract: '1.0',
    syncContract: 1,
    databaseMigration: '0004',
  } as BuildIdentity,
};

function session(check: ConnectedIdentityCheck = matched) {
  return new ConnectedImportSession({
    readProfile: vi.fn().mockReturnValue(profile),
    checkBackend: vi.fn().mockResolvedValue(check),
    describeProfile: () => [['Family server', profile.displayName]],
  });
}

describe('first-run connected import session', () => {
  it('keeps a matched preview confirmable after a canceled re-pick', async () => {
    const importSession = session();
    const preview = await importSession.preview('C:/profiles/family.json');
    expect(preview.status).toBe('preview');
    if (preview.status === 'preview') expect(preview.identity.state).toBe('matched');

    // "Choose a different file" then cancel: the old preview stays on screen,
    // so its Connect action must still resolve to the previously matched
    // profile instead of throwing.
    const canceled = await importSession.preview(undefined);
    expect(canceled).toEqual({ status: 'canceled' });
    expect(importSession.confirm()).toEqual(profile);
  });

  it('replaces the pending profile when a new file is actually selected', async () => {
    const replacement = { ...profile, displayName: 'Meadow family cloud' };
    const reads = vi.fn().mockReturnValueOnce(profile).mockReturnValueOnce(replacement);
    const importSession = new ConnectedImportSession({
      readProfile: reads,
      checkBackend: vi.fn().mockResolvedValue(matched),
      describeProfile: () => [],
    });
    await importSession.preview('C:/profiles/first.json');
    await importSession.preview('C:/profiles/second.json');
    expect(importSession.confirm().displayName).toBe('Meadow family cloud');
  });

  it('never leaves an unmatched or unreadable selection confirmable', async () => {
    const mismatchSession = session({ state: 'mismatch', problems: ['Sync contract differs'] });
    await mismatchSession.preview('C:/profiles/family.json');
    expect(() => mismatchSession.confirm()).toThrow(/awaiting confirmation/);

    const unreachableSession = session({ state: 'unreachable', message: 'offline' });
    await unreachableSession.preview('C:/profiles/family.json');
    expect(() => unreachableSession.confirm()).toThrow(/awaiting confirmation/);

    // A matched profile followed by a bad replacement pick must clear too.
    const importSession = new ConnectedImportSession({
      readProfile: vi
        .fn()
        .mockReturnValueOnce(profile)
        .mockImplementationOnce(() => {
          throw new Error('Connection profile is invalid or incompatible');
        }),
      checkBackend: vi.fn().mockResolvedValue(matched),
      describeProfile: () => [],
    });
    await importSession.preview('C:/profiles/good.json');
    const failed = await importSession.preview('C:/profiles/bad.json');
    expect(failed.status).toBe('error');
    expect(() => importSession.confirm()).toThrow(/awaiting confirmation/);
  });

  it('discards the pending profile on demand', async () => {
    const importSession = session();
    await importSession.preview('C:/profiles/family.json');
    importSession.discard();
    expect(() => importSession.confirm()).toThrow(/awaiting confirmation/);
  });
});
