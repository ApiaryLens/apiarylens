import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteStore } from '@apiarylens/database';
import { createWindowsDataPaths } from './paths.js';
import { createStandaloneBackup, readStandaloneBackup } from './standalone-backup.js';
import {
  acquireHeadlessLifecycleLock,
  readHeadlessLifecycleRequest,
  runHeadlessLifecycle,
  writeHeadlessLifecycleEvidence,
} from './headless-lifecycle.js';

const identity = { productVersion: '0.1.0-preview.6', databaseMigration: '0004' };

describe('headless Windows lifecycle', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture(name: string) {
    const root = join(tmpdir(), `apiarylens-headless-${name}-${crypto.randomUUID()}`);
    roots.push(root);
    const paths = createWindowsDataPaths(root);
    new SqliteStore(paths.database).close();
    return { root, paths };
  }

  function requestFile(root: string, operation: 'backup' | 'restore', archivePath: string) {
    const requestPath = join(root, `${operation}.json`);
    writeFileSync(
      requestPath,
      JSON.stringify({ schemaVersion: 1, operation, archivePath, expected: identity }),
    );
    return requestPath;
  }

  it('creates verified backup evidence without paths or secrets', async () => {
    const { root, paths } = fixture('backup');
    writeFileSync(paths.protectedSecrets, 'never-export-this-secret');
    const archive = join(root, 'family.albackup');
    const evidencePath = join(root, 'evidence.json');
    const requestPath = requestFile(root, 'backup', archive);
    const result = await runHeadlessLifecycle({
      requestPath,
      evidencePath,
      paths,
      identity,
      authRootSecret: 'not-used-for-backup',
      hooks: { verifyServiceHealth: async () => undefined },
    });
    expect(result.status).toBe('passed');
    expect(readStandaloneBackup(archive).manifest.productVersion).toBe(identity.productVersion);
    writeHeadlessLifecycleEvidence(evidencePath, result);
    const evidence = readFileSync(evidencePath, 'utf8');
    expect(evidence).not.toContain(root);
    expect(evidence).not.toContain('secret');
  });

  it('restores exact compatible data and creates a verified recovery backup', async () => {
    const current = fixture('restore-current');
    const source = fixture('restore-source');
    mkdirSync(join(source.paths.media, 'hive'), { recursive: true });
    writeFileSync(join(source.paths.media, 'hive', 'photo.jpg'), 'restored-photo');
    const archive = join(source.root, 'source.albackup');
    createStandaloneBackup(source.paths, archive, identity);
    const requestPath = requestFile(current.root, 'restore', archive);
    const result = await runHeadlessLifecycle({
      requestPath,
      evidencePath: join(current.root, 'evidence.json'),
      paths: current.paths,
      identity,
      authRootSecret: 'test-auth-root-secret-test-auth-root-secret',
      hooks: { verifyServiceHealth: async () => undefined },
      now: () => new Date('2026-07-17T18:00:00.000Z'),
    });
    expect(result).toMatchObject({
      status: 'passed',
      recoveryBackupVerified: true,
      rollbackPerformed: false,
    });
    expect(readFileSync(join(current.paths.media, 'hive', 'photo.jpg'), 'utf8')).toBe(
      'restored-photo',
    );
    expect(
      readStandaloneBackup(
        join(
          current.paths.backups,
          'apiarylens-headless-pre-restore-2026-07-17T18-00-00-000Z.albackup',
        ),
      ).manifest.productVersion,
    ).toBe(identity.productVersion);
  });

  it('rolls back current data when restored health verification fails', async () => {
    const current = fixture('rollback-current');
    const source = fixture('rollback-source');
    writeFileSync(join(current.paths.media, 'before.txt'), 'before');
    writeFileSync(join(source.paths.media, 'after.txt'), 'after');
    const archive = join(source.root, 'source.albackup');
    createStandaloneBackup(source.paths, archive, identity);
    let checks = 0;
    const result = await runHeadlessLifecycle({
      requestPath: requestFile(current.root, 'restore', archive),
      evidencePath: join(current.root, 'evidence.json'),
      paths: current.paths,
      identity,
      authRootSecret: 'test-auth-root-secret-test-auth-root-secret',
      hooks: {
        verifyServiceHealth: async () => {
          checks += 1;
          if (checks === 1) throw new Error('forced health failure');
        },
      },
    });
    expect(result).toMatchObject({
      status: 'failed',
      rollbackPerformed: true,
      rollbackVerified: true,
      errorCode: 'restore_failed',
    });
    expect(readFileSync(join(current.paths.media, 'before.txt'), 'utf8')).toBe('before');
  });

  it('rejects unknown secret-looking request fields and concurrent lifecycle locks', () => {
    const { root, paths } = fixture('negative');
    const archive = join(root, 'family.albackup');
    const requestPath = join(root, 'request.json');
    writeFileSync(
      requestPath,
      JSON.stringify({
        schemaVersion: 1,
        operation: 'backup',
        archivePath: archive,
        expected: identity,
        password: 'must-not-be-accepted',
      }),
    );
    expect(() => readHeadlessLifecycleRequest(requestPath, join(root, 'evidence.json'))).toThrow(
      /schema/,
    );
    const release = acquireHeadlessLifecycleLock(paths.runtime);
    expect(() => acquireHeadlessLifecycleLock(paths.runtime)).toThrow(/already running/);
    release();
  });
});
