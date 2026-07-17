import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { SqliteStore } from '@apiarylens/database';
import type { WindowsDataPaths } from './paths.js';
import {
  activateStagedStandaloneData,
  createStandaloneBackup,
  readStandaloneBackup,
  rollbackStandaloneData,
  restoreStandaloneBackupToStaging,
} from './standalone-backup.js';

export type HeadlessLifecycleIdentity = {
  productVersion: string;
  databaseMigration: string;
};

export type HeadlessLifecycleRequest = {
  schemaVersion: 1;
  operation: 'backup' | 'restore';
  archivePath: string;
  expected: HeadlessLifecycleIdentity;
};

export type HeadlessLifecycleEvidence = {
  schemaVersion: 1;
  operation: 'backup' | 'restore';
  status: 'passed' | 'failed';
  productVersion: string;
  databaseMigration: string;
  files?: number;
  sourceCreatedAt?: string;
  recoveryBackupVerified?: boolean;
  rollbackPerformed?: boolean;
  rollbackVerified?: boolean;
  errorCode?: 'invalid_request' | 'incompatible_backup' | 'backup_failed' | 'restore_failed';
};

export type HeadlessLifecycleHooks = {
  verifyServiceHealth(): Promise<void>;
};

export function acquireHeadlessLifecycleLock(runtimeDirectory: string): () => void {
  const directory = realpathSync.native(runtimeDirectory);
  const lockPath = join(directory, 'headless-lifecycle.lock');
  let descriptor: number;
  try {
    descriptor = openSync(lockPath, 'wx', 0o600);
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, schemaVersion: 1 }));
  } catch {
    throw new Error('Another Windows lifecycle operation is already running');
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    closeSync(descriptor);
    rmSync(lockPath, { force: true });
  };
}

type HeadlessLifecycleInput = {
  requestPath: string;
  evidencePath: string;
  paths: WindowsDataPaths;
  identity: HeadlessLifecycleIdentity;
  authRootSecret: string;
  hooks: HeadlessLifecycleHooks;
  now?: () => Date;
};

const requestKeys = new Set(['schemaVersion', 'operation', 'archivePath', 'expected']);
const expectedKeys = new Set(['productVersion', 'databaseMigration']);

function exactKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function canonicalExistingFile(path: string, extension: string): string {
  if (!isAbsolute(path) || extname(path).toLowerCase() !== extension) {
    throw new Error('Lifecycle input path is invalid');
  }
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error('Lifecycle input is not a safe file');
  return realpathSync.native(path);
}

function canonicalNewFile(path: string, extension: string): string {
  if (!isAbsolute(path) || extname(path).toLowerCase() !== extension || existsSync(path)) {
    throw new Error('Lifecycle output path is invalid or already exists');
  }
  const parent = realpathSync.native(dirname(path));
  const info = lstatSync(parent);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Lifecycle output folder is unsafe');
  }
  return join(parent, basename(path));
}

export function readHeadlessLifecycleRequest(
  requestPath: string,
  evidencePath: string,
): { request: HeadlessLifecycleRequest; evidencePath: string } {
  const canonicalRequest = canonicalExistingFile(requestPath, '.json');
  const canonicalEvidence = canonicalNewFile(evidencePath, '.json');
  if (canonicalRequest.toLowerCase() === canonicalEvidence.toLowerCase()) {
    throw new Error('Lifecycle request and evidence paths must be different');
  }
  const raw = readFileSync(canonicalRequest);
  if (raw.byteLength > 64 * 1024) throw new Error('Lifecycle request is too large');
  const value: unknown = JSON.parse(raw.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Lifecycle request is invalid');
  }
  const candidate = value as Record<string, unknown>;
  const expected = candidate.expected;
  if (
    !exactKeys(candidate, requestKeys) ||
    candidate.schemaVersion !== 1 ||
    (candidate.operation !== 'backup' && candidate.operation !== 'restore') ||
    typeof candidate.archivePath !== 'string' ||
    !expected ||
    typeof expected !== 'object' ||
    Array.isArray(expected) ||
    !exactKeys(expected as Record<string, unknown>, expectedKeys) ||
    typeof (expected as Record<string, unknown>).productVersion !== 'string' ||
    typeof (expected as Record<string, unknown>).databaseMigration !== 'string'
  ) {
    throw new Error('Lifecycle request schema is invalid');
  }
  const archivePath =
    candidate.operation === 'restore'
      ? canonicalExistingFile(candidate.archivePath, '.albackup')
      : canonicalNewFile(candidate.archivePath, '.albackup');
  return {
    request: { ...(candidate as unknown as HeadlessLifecycleRequest), archivePath },
    evidencePath: canonicalEvidence,
  };
}

export function writeHeadlessLifecycleEvidence(
  evidencePath: string,
  evidence: HeadlessLifecycleEvidence,
): void {
  const raw = `${JSON.stringify(evidence, null, 2)}\n`;
  const temporary = `${evidencePath}.${process.pid}.tmp`;
  writeFileSync(temporary, raw, { flag: 'wx', mode: 0o600 });
  try {
    renameSync(temporary, evidencePath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function compatible(
  expected: HeadlessLifecycleIdentity,
  actual: HeadlessLifecycleIdentity,
): boolean {
  return (
    expected.productVersion === actual.productVersion &&
    expected.databaseMigration === actual.databaseMigration
  );
}

function recoveryName(now: Date): string {
  const stamp = now.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return `apiarylens-headless-pre-restore-${stamp}.albackup`;
}

export async function runHeadlessLifecycle(
  input: HeadlessLifecycleInput,
): Promise<HeadlessLifecycleEvidence> {
  let parsed: ReturnType<typeof readHeadlessLifecycleRequest>;
  try {
    parsed = readHeadlessLifecycleRequest(input.requestPath, input.evidencePath);
  } catch {
    return {
      schemaVersion: 1,
      operation: 'backup',
      status: 'failed',
      productVersion: input.identity.productVersion,
      databaseMigration: input.identity.databaseMigration,
      errorCode: 'invalid_request',
    };
  }
  const { request } = parsed;
  const base = {
    schemaVersion: 1 as const,
    operation: request.operation,
    productVersion: input.identity.productVersion,
    databaseMigration: input.identity.databaseMigration,
  };
  if (!compatible(request.expected, input.identity)) {
    return { ...base, status: 'failed', errorCode: 'invalid_request' };
  }
  if (request.operation === 'backup') {
    try {
      const manifest = createStandaloneBackup(input.paths, request.archivePath, input.identity);
      readStandaloneBackup(request.archivePath);
      return { ...base, status: 'passed', files: manifest.files.length };
    } catch {
      return { ...base, status: 'failed', errorCode: 'backup_failed' };
    }
  }

  let verified: ReturnType<typeof readStandaloneBackup>;
  try {
    verified = readStandaloneBackup(request.archivePath);
  } catch {
    return { ...base, status: 'failed', errorCode: 'restore_failed' };
  }
  if (!compatible(verified.manifest, input.identity)) {
    return { ...base, status: 'failed', errorCode: 'incompatible_backup' };
  }

  mkdirSync(input.paths.backups, { recursive: true, mode: 0o700 });
  const now = input.now?.() ?? new Date();
  const recoveryPath = join(input.paths.backups, recoveryName(now));
  const stagingRoot = join(input.paths.root, 'headless-restore-staging');
  const rollbackData = join(input.paths.root, 'headless-restore-rollback-data');
  const currentData = dirname(input.paths.database);
  let cutoverStarted = false;
  let recoveryBackupVerified = false;
  try {
    const recovery = createStandaloneBackup(input.paths, recoveryPath, input.identity);
    const reread = readStandaloneBackup(recoveryPath);
    if (
      createHash('sha256').update(JSON.stringify(reread.manifest)).digest('hex') !==
      createHash('sha256').update(JSON.stringify(recovery)).digest('hex')
    ) {
      throw new Error('Recovery backup verification did not match');
    }
    recoveryBackupVerified = true;
    restoreStandaloneBackupToStaging(request.archivePath, stagingRoot);
    const stagedStore = new SqliteStore(join(stagingRoot, 'data', 'apiarylens.sqlite'), {
      authRootSecret: input.authRootSecret,
    });
    try {
      const integrity = stagedStore.database.prepare('PRAGMA integrity_check').get() as
        { integrity_check?: unknown } | undefined;
      if (integrity?.integrity_check !== 'ok') throw new Error('Restored SQLite is invalid');
      stagedStore.database.prepare('UPDATE sessions SET revoked_at = ?').run(now.toISOString());
    } finally {
      stagedStore.close();
    }
    activateStagedStandaloneData(currentData, join(stagingRoot, 'data'), rollbackData);
    cutoverStarted = true;
    await input.hooks.verifyServiceHealth();
    rmSync(rollbackData, { recursive: true, force: true });
    rmSync(stagingRoot, { recursive: true, force: true });
    return {
      ...base,
      status: 'passed',
      files: verified.manifest.files.length,
      sourceCreatedAt: verified.manifest.createdAt,
      recoveryBackupVerified,
      rollbackPerformed: false,
    };
  } catch {
    let rollbackVerified = false;
    if (cutoverStarted) {
      rollbackStandaloneData(currentData, rollbackData);
      try {
        await input.hooks.verifyServiceHealth();
        rollbackVerified = true;
      } catch {
        rollbackVerified = false;
      }
    }
    rmSync(stagingRoot, { recursive: true, force: true });
    return {
      ...base,
      status: 'failed',
      sourceCreatedAt: verified.manifest.createdAt,
      recoveryBackupVerified,
      rollbackPerformed: cutoverStarted,
      rollbackVerified,
      errorCode: 'restore_failed',
    };
  }
}
