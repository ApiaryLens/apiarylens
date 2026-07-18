import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWindowsDataPaths } from './paths.js';
import {
  deviceOwnerIdentifier,
  loadDeviceOwnerCredential,
  loadOrCreateDeviceOwnerCredential,
  loadOrCreateStandaloneSecrets,
  type SecretProtection,
} from './protected-secrets.js';

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const reversibleProtection: SecretProtection = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(Buffer.from(value, 'utf8').map((byte) => byte ^ 0x5a)),
  decryptString: (value) => Buffer.from(value.map((byte) => byte ^ 0x5a)).toString('utf8'),
};

describe('Windows per-user state', () => {
  it('places mutable data outside the application directory in one rooted layout', () => {
    const root = mkdtempSync(join(tmpdir(), 'apiarylens-windows-paths-'));
    temporaryRoots.push(root);
    const paths = createWindowsDataPaths(root);
    expect(paths.root).toBe(realpathSync.native(join(root, 'standalone')));
    expect(paths.database.startsWith(paths.root)).toBe(true);
    expect(paths.media.startsWith(paths.root)).toBe(true);
    expect(paths.protectedSecrets.startsWith(paths.root)).toBe(true);
    expect(() => createWindowsDataPaths('relative/path')).toThrow('absolute');
  });

  it('creates durable protected secrets once and never persists plaintext', () => {
    const root = mkdtempSync(join(tmpdir(), 'apiarylens-windows-secrets-'));
    temporaryRoots.push(root);
    const paths = createWindowsDataPaths(root);
    const first = loadOrCreateStandaloneSecrets(paths.protectedSecrets, reversibleProtection);
    const persisted = readFileSync(paths.protectedSecrets);
    expect(persisted.toString('utf8')).not.toContain(first.authRootSecret);
    expect(persisted.toString('utf8')).not.toContain(first.bootstrapToken);
    expect(loadOrCreateStandaloneSecrets(paths.protectedSecrets, reversibleProtection)).toEqual(
      first,
    );
  });

  it('creates the device-managed owner credential once and never persists plaintext', () => {
    const root = mkdtempSync(join(tmpdir(), 'apiarylens-windows-device-owner-'));
    temporaryRoots.push(root);
    const paths = createWindowsDataPaths(root);
    expect(loadDeviceOwnerCredential(paths.deviceOwnerCredential, reversibleProtection)).toBe(
      undefined,
    );
    const first = loadOrCreateDeviceOwnerCredential(
      paths.deviceOwnerCredential,
      reversibleProtection,
    );
    expect(first.identifier).toBe(deviceOwnerIdentifier);
    expect(first.password.length).toBeGreaterThanOrEqual(32);
    const persisted = readFileSync(paths.deviceOwnerCredential);
    expect(persisted.toString('utf8')).not.toContain(first.password);
    expect(
      loadOrCreateDeviceOwnerCredential(paths.deviceOwnerCredential, reversibleProtection),
    ).toEqual(first);
    expect(loadDeviceOwnerCredential(paths.deviceOwnerCredential, reversibleProtection)).toEqual(
      first,
    );
  });

  it('rejects a tampered device-owner credential instead of using it', () => {
    const root = mkdtempSync(join(tmpdir(), 'apiarylens-windows-device-owner-invalid-'));
    temporaryRoots.push(root);
    const paths = createWindowsDataPaths(root);
    writeFileSync(
      paths.deviceOwnerCredential,
      reversibleProtection.encryptString(
        JSON.stringify({ version: 1, identifier: 'someone-else', password: 'x'.repeat(40) }),
      ),
    );
    expect(() =>
      loadDeviceOwnerCredential(paths.deviceOwnerCredential, reversibleProtection),
    ).toThrow('device-owner credential state is invalid');
  });

  it('fails closed when operating-system protection is unavailable', () => {
    const root = mkdtempSync(join(tmpdir(), 'apiarylens-windows-unprotected-'));
    temporaryRoots.push(root);
    const paths = createWindowsDataPaths(root);
    expect(() =>
      loadOrCreateStandaloneSecrets(paths.protectedSecrets, {
        ...reversibleProtection,
        isEncryptionAvailable: () => false,
      }),
    ).toThrow('credential protection is unavailable');
  });
});
