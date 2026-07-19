import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteStore } from '@apiarylens/database';
import { MemoryMediaStore } from '@apiarylens/media';
import type { SyncOperation } from '@apiarylens/contracts';
import type { WindowsConnectionProfile } from './connected-profile.js';
import {
  SqliteMigrationJournal,
  SqliteMigrationTarget,
  journalContainsSecretLikeContent,
  recoverAuthorityCutover,
  rollbackConnectedAuthority,
  runStandaloneToConnectedMigration,
  type MigrationTarget,
} from './standalone-migration.js';

const roots: string[] = [];
const closeHandles: Array<() => void> = [];
afterEach(() => {
  for (const close of closeHandles.splice(0).reverse()) close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const profile: WindowsConnectionProfile = {
  schemaVersion: 1,
  profileId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Connected family',
  mode: 'connected',
  clientKind: 'windows',
  backendUrl: 'https://hives.example.test',
  deploymentProfile: 'compose',
  provisioningSource: 'scout',
  createdAt: '2026-07-17T16:00:00.000Z',
  compatibility: {
    productVersion: '0.1.0-preview.6',
    apiContract: '1.0',
    syncContract: 1,
    databaseMigration: '0004',
  },
};

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'apiarylens-production-migration-'));
  roots.push(root);
  const source = new SqliteStore(join(root, 'source.sqlite'));
  const targetStore = new SqliteStore(join(root, 'target.sqlite'));
  const sourceSession = source.bootstrap({
    identifier: 'standalone@example.test',
    displayName: 'Standalone Owner',
    passwordHash: 'password=must-never-enter-the-journal',
    organizationName: 'Standalone family',
    timezone: 'America/New_York',
  });
  const targetSession = targetStore.bootstrap({
    identifier: 'target@example.test',
    displayName: 'Target Owner',
    passwordHash: 'different-protected-secret',
    organizationName: 'Connected family',
    timezone: 'America/New_York',
  });
  const sourceMedia = new MemoryMediaStore();
  const targetMedia = new MemoryMediaStore();
  const journalPath = join(root, 'migration.sqlite');
  const journal = new SqliteMigrationJournal(journalPath);
  const target = new SqliteMigrationTarget(
    targetStore,
    targetMedia,
    targetSession.view.organization.id,
    targetSession.view.user.id,
  );
  closeHandles.push(
    () => journal.close(),
    () => targetStore.close(),
    () => source.close(),
  );
  return {
    root,
    source,
    targetStore,
    sourceSession,
    targetSession,
    sourceMedia,
    targetMedia,
    journalPath,
    journal,
    target,
  };
}

function seedApiaries(
  store: SqliteStore,
  organizationId: string,
  count: number,
  note = 'ordinary hive data',
): void {
  const timestamp = '2026-07-17T16:00:00.000Z';
  const insert = store.database.prepare(
    `INSERT INTO resources(
      organization_id,entity_type,id,version,value_json,created_at,updated_at,deleted_at
    ) VALUES (?, 'apiary', ?, 1, ?, ?, ?, NULL)`,
  );
  store.database.exec('BEGIN IMMEDIATE');
  try {
    for (let index = 0; index < count; index += 1) {
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      insert.run(
        organizationId,
        id,
        JSON.stringify({
          id,
          organizationId,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
          name: `Apiary ${index + 1}`,
          notes: note,
        }),
        timestamp,
        timestamp,
      );
    }
    store.database.exec('COMMIT');
  } catch (error) {
    store.database.exec('ROLLBACK');
    throw error;
  }
}

function migrationInput(
  fixture: ReturnType<typeof setup>,
  migrationId: string,
  target: MigrationTarget = fixture.target,
) {
  const backupPath = join(fixture.root, 'verified.albackup');
  let cutoverCount = 0;
  return {
    input: {
      journal: fixture.journal,
      migrationId,
      sourceOrganizationId: fixture.sourceSession.view.organization.id,
      source: fixture.source,
      sourceMedia: fixture.sourceMedia,
      target,
      profile,
      backupPath,
      createVerifiedBackup: () => writeFileSync(backupPath, 'verified-test-backup'),
      cutover: () => {
        cutoverCount += 1;
      },
    },
    cutovers: () => cutoverCount,
  };
}

describe('production standalone-to-connected migration', () => {
  it('resumes exactly once after target commit but before the local receipt checkpoint', async () => {
    const fixture = setup();
    seedApiaries(
      fixture.source,
      fixture.sourceSession.view.organization.id,
      225,
      'authorization: Bearer should remain private record content',
    );
    const migrationId = randomUUID();
    let injected = false;
    const interrupted: MigrationTarget = {
      ...fixture.target,
      preflight: fixture.target.preflight.bind(fixture.target),
      importRecords: async (items) => {
        const receipts = await fixture.target.importRecords(items);
        if (!injected) {
          injected = true;
          throw new Error('injected_process_exit_after_target_commit');
        }
        return receipts;
      },
      importMedia: fixture.target.importMedia.bind(fixture.target),
      reconcile: fixture.target.reconcile.bind(fixture.target),
      cursor: fixture.target.cursor.bind(fixture.target),
    };
    const first = migrationInput(fixture, migrationId, interrupted);
    await expect(runStandaloneToConnectedMigration(first.input)).rejects.toThrow(
      'injected_process_exit',
    );
    expect(fixture.journal.read(migrationId)).toMatchObject({
      phase: 'transferring',
      authority: 'standalone',
    });
    expect(
      fixture.targetStore.listResources(fixture.targetSession.view.organization.id, 'apiary'),
    ).toHaveLength(100);

    const resumed = migrationInput(fixture, migrationId);
    const completion = await runStandaloneToConnectedMigration(resumed.input);
    expect(completion.recordCount).toBe(225);
    expect(resumed.cutovers()).toBe(1);
    expect(fixture.journal.read(migrationId)).toMatchObject({
      phase: 'observing',
      authority: 'connected',
    });
    expect(
      fixture.targetStore.listResources(fixture.targetSession.view.organization.id, 'apiary'),
    ).toHaveLength(225);
    expect(
      fixture.targetStore.database.prepare('SELECT COUNT(*) count FROM idempotency').get(),
    ).toEqual({ count: 225 });
    expect(journalContainsSecretLikeContent(fixture.journalPath)).toBe(false);
  });

  it('transfers and reconciles media while retaining only hashes in the journal', async () => {
    const fixture = setup();
    const hiveId = randomUUID();
    const mediaId = randomUUID();
    const bytes = Buffer.from('private bee photo bytes');
    const operation: SyncOperation = {
      operationId: randomUUID(),
      clientId: randomUUID(),
      entityType: 'mediaAsset',
      entityId: mediaId,
      action: 'create',
      baseVersion: 0,
      payload: {
        hiveId,
        fileName: 'inspection.jpg',
        mediaType: 'image/jpeg',
        byteSize: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        state: 'ready',
      },
      queuedAt: new Date().toISOString(),
    };
    fixture.source.applyOperation(
      fixture.sourceSession.view.organization.id,
      fixture.sourceSession.view.user.id,
      operation,
    );
    await fixture.sourceMedia.put(fixture.sourceSession.view.organization.id, mediaId, bytes);
    const request = migrationInput(fixture, randomUUID());
    const completion = await runStandaloneToConnectedMigration(request.input);
    expect(completion).toMatchObject({ recordCount: 1, mediaCount: 1 });
    expect(
      Buffer.from(
        (await fixture.targetMedia.get(fixture.targetSession.view.organization.id, mediaId))!,
      ),
    ).toEqual(bytes);
    expect(journalContainsSecretLikeContent(fixture.journalPath)).toBe(false);
  });

  it('allows rollback only while the target has no remote-only writes', async () => {
    const fixture = setup();
    seedApiaries(fixture.source, fixture.sourceSession.view.organization.id, 2);
    const migrationId = randomUUID();
    await runStandaloneToConnectedMigration(migrationInput(fixture, migrationId).input);
    let profileRemoved = false;
    await rollbackConnectedAuthority({
      journal: fixture.journal,
      migrationId,
      target: fixture.target,
      removeProfile: () => {
        profileRemoved = true;
      },
    });
    expect(profileRemoved).toBe(true);
    expect(fixture.journal.read(migrationId)).toMatchObject({
      phase: 'rolled_back',
      authority: 'standalone',
    });

    const second = setup();
    seedApiaries(second.source, second.sourceSession.view.organization.id, 1);
    const secondId = randomUUID();
    await runStandaloneToConnectedMigration(migrationInput(second, secondId).input);
    second.targetStore.applyOperation(
      second.targetSession.view.organization.id,
      second.targetSession.view.user.id,
      {
        operationId: randomUUID(),
        clientId: randomUUID(),
        entityType: 'apiary',
        entityId: randomUUID(),
        action: 'create',
        baseVersion: 0,
        payload: { name: 'Remote-only apiary' },
        queuedAt: new Date().toISOString(),
      },
    );
    await expect(
      rollbackConnectedAuthority({
        journal: second.journal,
        migrationId: secondId,
        target: second.target,
        removeProfile: () => undefined,
      }),
    ).rejects.toThrow(/Remote-only writes/);
    expect(second.journal.read(secondId)?.authority).toBe('connected');
  });

  it('recovers an authority cutover interrupted after the atomic profile write', async () => {
    const fixture = setup();
    seedApiaries(fixture.source, fixture.sourceSession.view.organization.id, 1);
    const migrationId = randomUUID();
    const request = migrationInput(fixture, migrationId);
    let committedProfile: WindowsConnectionProfile | undefined;
    await expect(
      runStandaloneToConnectedMigration({
        ...request.input,
        cutover: (nextProfile) => {
          committedProfile = nextProfile;
          throw new Error('injected_exit_after_atomic_profile_replace');
        },
      }),
    ).rejects.toThrow(/atomic_profile_replace/);
    expect(fixture.journal.read(migrationId)).toMatchObject({
      phase: 'reconciled',
      authority: 'standalone',
    });
    expect(committedProfile?.migration).toMatchObject({ migrationId });
    recoverAuthorityCutover(fixture.journal, committedProfile!);
    expect(fixture.journal.read(migrationId)).toMatchObject({
      phase: 'observing',
      authority: 'connected',
      cutoverCursor: committedProfile!.migration!.cutoverCursor,
    });
  });

  it('durably transfers the 20,000-record family reference workload in bounded batches', async () => {
    const fixture = setup();
    seedApiaries(fixture.source, fixture.sourceSession.view.organization.id, 20_000);
    const migrationId = randomUUID();
    let checkpoints = 0;
    const request = migrationInput(fixture, migrationId);
    const completion = await runStandaloneToConnectedMigration({
      ...request.input,
      afterBatch: () => {
        checkpoints += 1;
      },
    });
    expect(completion.recordCount).toBe(20_000);
    expect(checkpoints).toBe(200);
    expect(fixture.journal.stats(migrationId)).toEqual({
      total: 20_000,
      accepted: 20_000,
      pending: 0,
    });
    expect(
      fixture.targetStore.database
        .prepare('SELECT COUNT(*) count FROM resources WHERE organization_id=?')
        .get(fixture.targetSession.view.organization.id),
    ).toEqual({ count: 20_000 });
  }, 120_000);
});
