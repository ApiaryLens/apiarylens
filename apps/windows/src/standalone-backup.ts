import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { hashPassword } from '@apiarylens/server/password';
import type { SqliteStore } from '@apiarylens/database';
import type { WindowsDataPaths } from './paths.js';
import {
  deviceOwnerIdentifier,
  loadOrCreateDeviceOwnerCredential,
  type SecretProtection,
} from './protected-secrets.js';

const magic = Buffer.from('APIARYLENS-BACKUP-V1\n', 'ascii');
const maxArchiveBytes = 2 * 1024 * 1024 * 1024;

export type StandaloneBackupManifest = {
  schemaVersion: 1;
  product: 'ApiaryLens';
  productVersion: string;
  createdAt: string;
  databaseMigration: string;
  files: Array<{ path: string; bytes: number; sha256: string; offset: number }>;
};

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeArchivePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 240 &&
    !path.includes('\\') &&
    !path.startsWith('/') &&
    !path.split('/').some((part) => part === '' || part === '.' || part === '..')
  );
}

function collectFiles(root: string, prefix: string): Array<{ path: string; bytes: Buffer }> {
  const files: Array<{ path: string; bytes: Buffer }> = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Backup source cannot contain symbolic links');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const child = relative(root, absolute).split(sep).join('/');
        const path = `${prefix}/${child}`;
        if (!safeArchivePath(path)) throw new Error('Backup source contains an unsafe path');
        files.push({ path, bytes: readFileSync(absolute) });
      } else throw new Error('Backup source contains an unsupported filesystem object');
    }
  };
  visit(root);
  return files;
}

export function createStandaloneBackup(
  paths: WindowsDataPaths,
  destination: string,
  identity: { productVersion: string; databaseMigration: string; createdAt?: Date },
): StandaloneBackupManifest {
  const database = readFileSync(paths.database);
  if (!database.subarray(0, 16).equals(Buffer.from('SQLite format 3\0', 'binary'))) {
    throw new Error('Standalone database is not a valid SQLite file');
  }
  const payloads = [
    { path: 'data/apiarylens.sqlite', bytes: database },
    ...collectFiles(paths.media, 'data/media'),
  ].sort((left, right) => left.path.localeCompare(right.path));
  let offset = 0;
  const files = payloads.map((file) => {
    const record = {
      path: file.path,
      bytes: file.bytes.length,
      sha256: digest(file.bytes),
      offset,
    };
    offset += file.bytes.length;
    return record;
  });
  if (offset > maxArchiveBytes) throw new Error('Standalone backup exceeds the supported size');
  const manifest: StandaloneBackupManifest = {
    schemaVersion: 1,
    product: 'ApiaryLens',
    productVersion: identity.productVersion,
    createdAt: (identity.createdAt ?? new Date()).toISOString(),
    databaseMigration: identity.databaseMigration,
    files,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(manifestBytes.length);
  const compressed = gzipSync(
    Buffer.concat([magic, length, manifestBytes, ...payloads.map((file) => file.bytes)]),
    { level: 9 },
  );
  mkdirSync(dirname(resolve(destination)), { recursive: true, mode: 0o700 });
  const temporary = `${resolve(destination)}.tmp`;
  writeFileSync(temporary, compressed, { mode: 0o600 });
  renameSync(temporary, resolve(destination));
  return manifest;
}

export function readStandaloneBackup(path: string): {
  manifest: StandaloneBackupManifest;
  files: ReadonlyMap<string, Buffer>;
} {
  const compressed = readFileSync(resolve(path));
  const raw = gunzipSync(compressed, { maxOutputLength: maxArchiveBytes });
  if (!raw.subarray(0, magic.length).equals(magic)) throw new Error('Backup format is unsupported');
  const manifestLength = raw.readUInt32BE(magic.length);
  if (manifestLength < 2 || manifestLength > 1024 * 1024)
    throw new Error('Backup manifest length is invalid');
  const payloadStart = magic.length + 4 + manifestLength;
  const value: unknown = JSON.parse(raw.subarray(magic.length + 4, payloadStart).toString('utf8'));
  if (!value || typeof value !== 'object') throw new Error('Backup manifest is invalid');
  const manifest = value as StandaloneBackupManifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.product !== 'ApiaryLens' ||
    typeof manifest.productVersion !== 'string' ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    typeof manifest.databaseMigration !== 'string' ||
    !Array.isArray(manifest.files)
  )
    throw new Error('Backup identity is invalid');
  const files = new Map<string, Buffer>();
  let expectedOffset = 0;
  for (const file of manifest.files) {
    if (
      !file ||
      !safeArchivePath(file.path) ||
      files.has(file.path) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      file.offset !== expectedOffset ||
      !/^[0-9a-f]{64}$/.test(file.sha256)
    )
      throw new Error('Backup file index is invalid');
    const start = payloadStart + file.offset;
    const end = start + file.bytes;
    if (end > raw.length) throw new Error('Backup payload is truncated');
    const bytes = raw.subarray(start, end);
    if (digest(bytes) !== file.sha256) throw new Error(`Backup checksum failed for ${file.path}`);
    files.set(file.path, Buffer.from(bytes));
    expectedOffset += file.bytes;
  }
  if (payloadStart + expectedOffset !== raw.length || !files.has('data/apiarylens.sqlite'))
    throw new Error('Backup payload does not match its manifest');
  return { manifest, files };
}

export function restoreStandaloneBackupToStaging(
  archivePath: string,
  stagingRoot: string,
): StandaloneBackupManifest {
  const { manifest, files } = readStandaloneBackup(archivePath);
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
  for (const [path, bytes] of files) {
    const destination = resolve(stagingRoot, ...path.split('/'));
    if (!destination.startsWith(`${resolve(stagingRoot)}${sep}`))
      throw new Error('Backup extraction escaped the staging directory');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, bytes, { mode: 0o600 });
  }
  const database = resolve(stagingRoot, 'data', 'apiarylens.sqlite');
  if (basename(database) !== 'apiarylens.sqlite' || !lstatSync(database).isFile())
    throw new Error('Restored database is missing');
  return manifest;
}

export function activateStagedStandaloneData(
  currentData: string,
  stagedData: string,
  rollbackData: string,
): void {
  rmSync(rollbackData, { recursive: true, force: true });
  renameSync(currentData, rollbackData);
  try {
    renameSync(stagedData, currentData);
  } catch (error) {
    renameSync(rollbackData, currentData);
    throw error;
  }
}

export function rollbackStandaloneData(currentData: string, rollbackData: string): void {
  rmSync(currentData, { recursive: true, force: true });
  renameSync(rollbackData, currentData);
}

/**
 * Backups deliberately carry only `data/` — never DPAPI-protected credentials,
 * which cannot leave the Windows profile that minted them. When a no-account
 * standalone backup is restored on a fresh profile or replacement PC, the
 * restored database still holds its hidden device-managed owner, but this
 * machine's `device-owner.v1.bin` is either absent or belongs to a different
 * apiary, so silent sign-in would fail and the person — who was never shown a
 * password or recovery codes — would be locked out (WIN-028). Before cutover,
 * rebind the restored owner to this machine's device credential by rewriting
 * its password hash under the local auth root secret.
 */
export async function rebindRestoredDeviceOwner(
  stagedStore: SqliteStore,
  deviceOwnerCredentialPath: string,
  protection: SecretProtection,
  authRootSecret: string,
): Promise<boolean> {
  const restoredOwner = stagedStore.verifyCredentials(deviceOwnerIdentifier);
  if (!restoredOwner) return false;
  const local = loadOrCreateDeviceOwnerCredential(deviceOwnerCredentialPath, protection);
  stagedStore.updatePasswordHash(
    restoredOwner.userId,
    await hashPassword(local.password, authRootSecret),
  );
  return true;
}
