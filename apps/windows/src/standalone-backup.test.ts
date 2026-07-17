import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteStore } from '@apiarylens/database';
import { createWindowsDataPaths } from './paths.js';
import {
  activateStagedStandaloneData,
  createStandaloneBackup,
  readStandaloneBackup,
  rollbackStandaloneData,
  restoreStandaloneBackupToStaging,
} from './standalone-backup.js';

describe('standalone backup archive', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('creates, verifies, and stages database and media without protected secrets', () => {
    const root = join(tmpdir(), `apiarylens-backup-${crypto.randomUUID()}`);
    roots.push(root);
    const paths = createWindowsDataPaths(root);
    new SqliteStore(paths.database).close();
    mkdirSync(join(paths.media, 'hive'), { recursive: true });
    writeFileSync(join(paths.media, 'hive', 'photo.jpg'), 'photo-bytes');
    writeFileSync(paths.protectedSecrets, 'must-not-be-exported');
    const archive = join(paths.backups, 'family.albackup');

    const manifest = createStandaloneBackup(paths, archive, {
      productVersion: '0.1.0-preview.1',
      databaseMigration: '0004',
      createdAt: new Date('2026-07-17T16:00:00.000Z'),
    });
    const verified = readStandaloneBackup(archive);
    expect(verified.manifest).toEqual(manifest);
    expect(verified.files.get('data/media/hive/photo.jpg')?.toString()).toBe('photo-bytes');
    expect(gunzipSync(readFileSync(archive)).toString()).not.toContain('must-not-be-exported');

    const staging = join(root, 'restore');
    restoreStandaloneBackupToStaging(archive, staging);
    expect(
      readFileSync(join(staging, 'data', 'apiarylens.sqlite'))
        .subarray(0, 16)
        .toString(),
    ).toBe('SQLite format 3\0');
    expect(readFileSync(join(staging, 'data', 'media', 'hive', 'photo.jpg'), 'utf8')).toBe(
      'photo-bytes',
    );
  });

  it('rejects a modified payload before extraction', () => {
    const root = join(tmpdir(), `apiarylens-backup-${crypto.randomUUID()}`);
    roots.push(root);
    const paths = createWindowsDataPaths(root);
    new SqliteStore(paths.database).close();
    const archive = join(paths.backups, 'family.albackup');
    createStandaloneBackup(paths, archive, {
      productVersion: '0.1.0-preview.1',
      databaseMigration: '0004',
    });
    const raw = gunzipSync(readFileSync(archive));
    raw[raw.length - 1] = (raw.at(-1) ?? 0) ^ 0xff;
    writeFileSync(archive, gzipSync(raw));
    expect(() => readStandaloneBackup(archive)).toThrow(/checksum/);
  });

  it('atomically activates staged data and can roll back a failed health gate', () => {
    const root = join(tmpdir(), `apiarylens-cutover-${crypto.randomUUID()}`);
    roots.push(root);
    const current = join(root, 'data');
    const staged = join(root, 'staged-data');
    const rollback = join(root, 'rollback-data');
    mkdirSync(current, { recursive: true });
    mkdirSync(staged, { recursive: true });
    writeFileSync(join(current, 'identity.txt'), 'before');
    writeFileSync(join(staged, 'identity.txt'), 'restored');

    activateStagedStandaloneData(current, staged, rollback);
    expect(readFileSync(join(current, 'identity.txt'), 'utf8')).toBe('restored');
    expect(readFileSync(join(rollback, 'identity.txt'), 'utf8')).toBe('before');

    rollbackStandaloneData(current, rollback);
    expect(readFileSync(join(current, 'identity.txt'), 'utf8')).toBe('before');
  });
});
