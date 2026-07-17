import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SqliteStore } from '../../packages/database/dist/index.js';
import { FilesystemMediaStore } from '../../packages/media/dist/index.js';

const RESOURCE_TYPES = [
  'apiary',
  'hive',
  'queen',
  'equipmentBox',
  'inspection',
  'miteCount',
  'healthObservation',
  'feedingEvent',
  'treatmentEvent',
  'harvest',
  'followUp',
  'mediaAsset',
];
const META_FIELDS = new Set([
  'id',
  'organizationId',
  'version',
  'createdAt',
  'updatedAt',
  'deletedAt',
]);
const SECRET_SENTINEL = 'WIN006-secret-must-never-enter-evidence';

class InjectedInterruption extends Error {}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function payload(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !META_FIELDS.has(key)));
}

async function atomicJson(path, value) {
  const next = `${path}.next`;
  await writeFile(next, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(next, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function operation(entityType, entityId, body) {
  return {
    operationId: randomUUID(),
    clientId: randomUUID(),
    entityType,
    entityId,
    action: 'create',
    baseVersion: 0,
    payload: body,
    queuedAt: new Date().toISOString(),
  };
}

async function seedScenario(
  root,
  { conflictingTarget = false, mediaSize, includeThumbnail = false } = {},
) {
  await mkdir(root, { recursive: true });
  const source = new SqliteStore(join(root, 'source.sqlite'), { authRootSecret: SECRET_SENTINEL });
  const target = new SqliteStore(join(root, 'target.sqlite'), { authRootSecret: SECRET_SENTINEL });
  const sourceSession = source.bootstrap({
    identifier: 'standalone-owner@example.test',
    displayName: 'Standalone Owner',
    passwordHash: SECRET_SENTINEL,
    organizationName: 'Standalone Family',
    timezone: 'America/New_York',
  });
  const targetSession = target.bootstrap({
    identifier: 'connected-owner@example.test',
    displayName: 'Connected Owner',
    passwordHash: SECRET_SENTINEL,
    organizationName: 'Connected Family',
    timezone: 'America/New_York',
  });
  const sourceOrg = sourceSession.view.organization.id;
  const targetOrg = targetSession.view.organization.id;
  const sourceUser = sourceSession.view.user.id;
  const targetUser = targetSession.view.user.id;
  const apiaryId = randomUUID();
  const hiveId = randomUUID();
  const inspectionId = randomUUID();
  const mediaId = randomUUID();
  const mediaBytes = mediaSize
    ? new Uint8Array(mediaSize).fill(0x5a)
    : new TextEncoder().encode('research-only-photo-content');
  const thumbnailBytes = includeThumbnail
    ? new TextEncoder().encode('research-only-thumbnail-content')
    : undefined;
  const records = [
    operation('apiary', apiaryId, { name: 'Back field' }),
    operation('hive', hiveId, { apiaryId, name: 'Hive one', status: 'active' }),
    operation('inspection', inspectionId, {
      hiveId,
      inspectedAt: '2026-07-16T18:00:00.000Z',
      inspectorName: 'Standalone Owner',
      state: 'complete',
      temperament: 'calm',
      populationStrength: 'strong',
    }),
    operation('mediaAsset', mediaId, {
      hiveId,
      inspectionId,
      fileName: 'inspection.jpg',
      mediaType: 'image/jpeg',
      byteSize: mediaBytes.byteLength,
      sha256: hash(mediaBytes),
      state: 'ready',
    }),
  ];
  for (const item of records) {
    assert.equal(source.applyOperation(sourceOrg, sourceUser, item).status, 'accepted');
  }
  if (conflictingTarget) {
    const conflict = operation('apiary', apiaryId, { name: 'Existing target apiary' });
    assert.equal(target.applyOperation(targetOrg, targetUser, conflict).status, 'accepted');
  }
  source.close();
  target.close();
  const sourceMedia = new FilesystemMediaStore(join(root, 'source-media'));
  await sourceMedia.put(sourceOrg, mediaId, mediaBytes);
  if (thumbnailBytes) await sourceMedia.put(sourceOrg, mediaId, thumbnailBytes, 'thumbnail');
  await atomicJson(join(root, 'client-config.json'), {
    mode: 'standalone',
    endpoint: 'http://127.0.0.1',
  });
  await atomicJson(join(root, 'identities.json'), { sourceOrg, targetOrg, sourceUser, targetUser });
}

function inventory(store, organizationId) {
  return RESOURCE_TYPES.flatMap((entityType) =>
    store.listResources(organizationId, entityType).map((record) => ({
      entityType,
      entityId: record.id,
      payload: payload(record),
      payloadHash: hash(canonical(payload(record))),
    })),
  ).sort((left, right) =>
    `${left.entityType}:${left.entityId}`.localeCompare(`${right.entityType}:${right.entityId}`),
  );
}

async function createJournal(root, identities) {
  await cp(join(root, 'source.sqlite'), join(root, 'backup.sqlite'));
  await cp(join(root, 'source-media'), join(root, 'backup-media'), { recursive: true });
  const source = new SqliteStore(join(root, 'source.sqlite'));
  const records = inventory(source, identities.sourceOrg).map((item) => ({
    ...item,
    operationId: randomUUID(),
    state: 'pending',
  }));
  source.close();
  const sourceMedia = new FilesystemMediaStore(join(root, 'source-media'));
  const media = [];
  for (const item of records.filter((candidate) => candidate.entityType === 'mediaAsset')) {
    for (const variant of ['original', 'thumbnail']) {
      const bytes = await sourceMedia.get(identities.sourceOrg, item.entityId, variant);
      if (bytes) {
        media.push({
          entityId: item.entityId,
          variant,
          sha256: hash(bytes),
          byteSize: bytes.byteLength,
          state: 'pending',
        });
      }
    }
  }
  const journal = {
    schemaVersion: 1,
    migrationId: randomUUID(),
    status: 'transferring',
    sourceOrganizationId: identities.sourceOrg,
    targetOrganizationId: identities.targetOrg,
    records,
    media,
    duplicateOperations: 0,
    duplicateMediaWrites: 0,
    conflicts: [],
    cutoverCursor: null,
  };
  await atomicJson(join(root, 'migration-journal.json'), journal);
  return journal;
}

async function migrate(root, options = {}) {
  if ((options.syncContractVersion ?? 1) !== 1) throw new Error('incompatible_sync_contract');
  const identities = await readJson(join(root, 'identities.json'));
  const journalPath = join(root, 'migration-journal.json');
  let journal;
  try {
    journal = await readJson(journalPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    journal = await createJournal(root, identities);
  }
  const target = new SqliteStore(join(root, 'target.sqlite'));
  const sourceMedia = new FilesystemMediaStore(join(root, 'source-media'));
  const targetMedia = new FilesystemMediaStore(join(root, 'target-media'));
  let applied = 0;
  try {
    for (const item of journal.records) {
      if (item.state === 'verified') continue;
      const result = target.applyOperation(identities.targetOrg, identities.targetUser, {
        operationId: item.operationId,
        clientId: journal.migrationId,
        entityType: item.entityType,
        entityId: item.entityId,
        action: 'create',
        baseVersion: 0,
        payload: item.payload,
        queuedAt: '2026-07-16T18:00:00.000Z',
      });
      applied += 1;
      if (options.interruptAfterApply === applied) throw new InjectedInterruption('record_apply');
      if (result.status === 'duplicate') journal.duplicateOperations += 1;
      if (result.status === 'conflict') {
        journal.conflicts.push({
          entityType: item.entityType,
          entityId: item.entityId,
          sourceHash: item.payloadHash,
          targetHash: result.serverValue ? hash(canonical(payload(result.serverValue))) : null,
        });
        journal.status = 'conflict';
        await atomicJson(journalPath, journal);
        throw new Error('migration_conflict');
      }
      assert.ok(result.status === 'accepted' || result.status === 'duplicate');
      assert.equal(hash(canonical(payload(result.serverValue))), item.payloadHash);
      item.state = 'verified';
      await atomicJson(journalPath, journal);
    }
    for (const item of journal.media) {
      if (item.state === 'verified') continue;
      const bytes = await sourceMedia.get(identities.sourceOrg, item.entityId, item.variant);
      assert.ok(bytes, 'source media is present');
      assert.equal(hash(bytes), item.sha256);
      assert.equal(bytes.byteLength, item.byteSize);
      const existing = await targetMedia.get(identities.targetOrg, item.entityId, item.variant);
      if (existing && hash(existing) === item.sha256) journal.duplicateMediaWrites += 1;
      await targetMedia.put(identities.targetOrg, item.entityId, bytes, item.variant);
      applied += 1;
      if (options.interruptAfterApply === applied) throw new InjectedInterruption('media_apply');
      const copied = await targetMedia.get(identities.targetOrg, item.entityId, item.variant);
      assert.ok(copied);
      assert.equal(hash(copied), item.sha256);
      item.state = 'verified';
      await atomicJson(journalPath, journal);
    }
    if (options.tamperMediaBeforeReconcile) {
      const first = journal.media[0];
      await targetMedia.put(
        identities.targetOrg,
        first.entityId,
        new TextEncoder().encode('tampered'),
        first.variant,
      );
    }
    const targetRecords = inventory(target, identities.targetOrg);
    assert.equal(targetRecords.length, journal.records.length, 'record count reconciles');
    for (const expected of journal.records) {
      const actual = targetRecords.find(
        (item) => item.entityType === expected.entityType && item.entityId === expected.entityId,
      );
      assert.equal(actual?.payloadHash, expected.payloadHash, 'record hash reconciles');
    }
    for (const expected of journal.media) {
      const bytes = await targetMedia.get(
        identities.targetOrg,
        expected.entityId,
        expected.variant,
      );
      assert.ok(bytes);
      assert.equal(hash(bytes), expected.sha256, 'media hash reconciles');
      assert.equal(bytes.byteLength, expected.byteSize, 'media size reconciles');
    }
    journal.cutoverCursor = target.pullChanges(identities.targetOrg, 0, 250).nextCursor;
    journal.status = 'complete';
    await atomicJson(journalPath, journal);
    await atomicJson(join(root, 'client-config.json'), {
      mode: 'connected',
      endpoint: 'https://connected.example.test',
      migrationId: journal.migrationId,
    });
    return journal;
  } finally {
    target.close();
  }
}

async function rollback(root) {
  const identities = await readJson(join(root, 'identities.json'));
  const journal = await readJson(join(root, 'migration-journal.json'));
  const target = new SqliteStore(join(root, 'target.sqlite'));
  const currentCursor = target.pullChanges(identities.targetOrg, 0, 250).nextCursor;
  target.close();
  if (currentCursor !== journal.cutoverCursor)
    return { status: 'blocked', reason: 'remote_changes' };
  await atomicJson(join(root, 'client-config.json'), {
    mode: 'standalone',
    endpoint: 'http://127.0.0.1',
    rolledBackMigrationId: journal.migrationId,
  });
  return { status: 'rolled_back' };
}

async function restoreBackup(root) {
  await rm(join(root, 'restored.sqlite'), { force: true });
  await rm(join(root, 'restored-media'), { recursive: true, force: true });
  await cp(join(root, 'backup.sqlite'), join(root, 'restored.sqlite'));
  await cp(join(root, 'backup-media'), join(root, 'restored-media'), { recursive: true });
  const identities = await readJson(join(root, 'identities.json'));
  const restored = new SqliteStore(join(root, 'restored.sqlite'));
  const count = inventory(restored, identities.sourceOrg).length;
  restored.close();
  return count;
}

async function addRemoteWrite(root) {
  const identities = await readJson(join(root, 'identities.json'));
  const target = new SqliteStore(join(root, 'target.sqlite'));
  const result = target.applyOperation(
    identities.targetOrg,
    identities.targetUser,
    operation('apiary', randomUUID(), { name: 'Remote-only apiary' }),
  );
  target.close();
  assert.equal(result.status, 'accepted');
}

async function run(output) {
  const workspace = resolve(output, 'work');
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  const results = [];

  const happy = join(workspace, 'happy');
  await seedScenario(happy);
  const completed = await migrate(happy);
  assert.equal(completed.status, 'complete');
  assert.equal(await restoreBackup(happy), 4);
  assert.equal((await rollback(happy)).status, 'rolled_back');
  results.push('complete-transfer-reconcile-backup-restore-rollback');

  for (let interruption = 1; interruption <= 5; interruption += 1) {
    const root = join(workspace, `resume-${interruption}`);
    await seedScenario(root);
    await assert.rejects(
      migrate(root, { interruptAfterApply: interruption }),
      InjectedInterruption,
    );
    const resumed = await migrate(root);
    assert.equal(resumed.status, 'complete');
    assert.ok(
      resumed.duplicateOperations + resumed.duplicateMediaWrites >= 1,
      'record or media retry is observed',
    );
  }
  results.push('interruption-resume-at-every-record-and-media-boundary');

  const scale = join(workspace, 'maximum-media');
  await seedScenario(scale, { mediaSize: 25 * 1024 * 1024, includeThumbnail: true });
  const scaled = await migrate(scale);
  assert.equal(scaled.status, 'complete');
  assert.equal(scaled.media.length, 2);
  assert.equal(
    scaled.media.find((item) => item.variant === 'original')?.byteSize,
    25 * 1024 * 1024,
  );
  assert.ok(scaled.media.some((item) => item.variant === 'thumbnail'));
  results.push('maximum-25-mib-original-and-thumbnail-transfer');

  const conflict = join(workspace, 'conflict');
  await seedScenario(conflict, { conflictingTarget: true });
  await assert.rejects(migrate(conflict), /migration_conflict/);
  assert.equal((await readJson(join(conflict, 'client-config.json'))).mode, 'standalone');
  assert.equal((await readJson(join(conflict, 'migration-journal.json'))).conflicts.length, 1);
  results.push('conflict-preview-blocks-cutover');

  const mismatch = join(workspace, 'mismatch');
  await seedScenario(mismatch);
  await assert.rejects(migrate(mismatch, { tamperMediaBeforeReconcile: true }), /media hash/);
  assert.equal((await readJson(join(mismatch, 'client-config.json'))).mode, 'standalone');
  results.push('media-mismatch-blocks-cutover');

  const incompatible = join(workspace, 'incompatible');
  await seedScenario(incompatible);
  await assert.rejects(migrate(incompatible, { syncContractVersion: 2 }), /incompatible/);
  assert.equal((await readJson(join(incompatible, 'client-config.json'))).mode, 'standalone');
  results.push('incompatible-contract-blocks-before-transfer');

  const remote = join(workspace, 'remote-change');
  await seedScenario(remote);
  await migrate(remote);
  await addRemoteWrite(remote);
  assert.deepEqual(await rollback(remote), { status: 'blocked', reason: 'remote_changes' });
  assert.equal((await readJson(join(remote, 'client-config.json'))).mode, 'connected');
  results.push('post-cutover-remote-write-blocks-destructive-rollback');

  const evidenceText = await Promise.all(
    [happy, scale, conflict, mismatch, incompatible, remote].map(async (root) => {
      let text = '';
      for (const file of ['migration-journal.json', 'client-config.json']) {
        try {
          text += await readFile(join(root, file), 'utf8');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      return text;
    }),
  );
  assert.ok(!evidenceText.join('').includes(SECRET_SENTINEL));
  results.push('journal-config-and-evidence-contain-no-secret-values');

  const report = {
    researchId: 'WIN-006',
    result: 'passed',
    syncContractVersion: 1,
    scenarios: results,
    assertions: {
      recordsPerScenario: 4,
      mediaVariantsInScaleScenario: 2,
      maximumOriginalMediaBytes: 25 * 1024 * 1024,
      interruptionBoundaries: 5,
      identitiesMigrated: false,
      atomicCutoverAfterReconciliation: true,
      destructiveRollbackAfterRemoteWrite: false,
      secretValuesInEvidence: false,
    },
  };
  await mkdir(output, { recursive: true });
  await atomicJson(join(output, 'win006-migration-evidence.json'), report);
  await rm(workspace, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 2));
}

const outputIndex = process.argv.indexOf('--output');
if (outputIndex < 0 || !process.argv[outputIndex + 1]) {
  throw new Error('Usage: node win006-migration-spike.mjs --output <directory>');
}
await run(resolve(process.argv[outputIndex + 1]));
