import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type SecretProtection = {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

export type StandaloneSecrets = {
  version: 1;
  authRootSecret: string;
  bootstrapToken: string;
};

function validSecrets(value: unknown): value is StandaloneSecrets {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StandaloneSecrets>;
  return (
    candidate.version === 1 &&
    typeof candidate.authRootSecret === 'string' &&
    candidate.authRootSecret.length >= 43 &&
    typeof candidate.bootstrapToken === 'string' &&
    candidate.bootstrapToken.length >= 32
  );
}

function writeProtected(targetPath: string, protection: SecretProtection, value: unknown): void {
  const temporaryPath = join(dirname(targetPath), `.protected.${process.pid}.tmp`);
  try {
    writeFileSync(temporaryPath, protection.encryptString(JSON.stringify(value)), {
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporaryPath, targetPath);
    chmodSync(targetPath, 0o600);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function loadOrCreateStandaloneSecrets(
  targetPath: string,
  protection: SecretProtection,
): StandaloneSecrets {
  if (!protection.isEncryptionAvailable()) {
    throw new Error('Windows credential protection is unavailable; standalone startup stopped');
  }
  if (existsSync(targetPath)) {
    const decrypted = protection.decryptString(readFileSync(targetPath));
    const parsed: unknown = JSON.parse(decrypted);
    if (!validSecrets(parsed)) throw new Error('Protected standalone credential state is invalid');
    return parsed;
  }

  const secrets: StandaloneSecrets = {
    version: 1,
    authRootSecret: randomBytes(48).toString('base64url'),
    bootstrapToken: randomBytes(32).toString('base64url'),
  };
  writeProtected(targetPath, protection, secrets);
  return secrets;
}

/**
 * The disconnected-mode owner credential. ApiaryLens for Windows generates and
 * safeguards this itself so a disconnected apiary never asks a person to create
 * or remember an account (ADR 0015 standalone mode; WIN-028). The identifier is
 * fixed and the password is random, DPAPI-protected, and never displayed.
 */
export type DeviceOwnerCredential = {
  version: 1;
  identifier: string;
  password: string;
};

export const deviceOwnerIdentifier = 'device-owner';

function validDeviceOwner(value: unknown): value is DeviceOwnerCredential {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeviceOwnerCredential>;
  return (
    candidate.version === 1 &&
    candidate.identifier === deviceOwnerIdentifier &&
    typeof candidate.password === 'string' &&
    candidate.password.length >= 32
  );
}

export function loadDeviceOwnerCredential(
  targetPath: string,
  protection: SecretProtection,
): DeviceOwnerCredential | undefined {
  if (!existsSync(targetPath)) return undefined;
  if (!protection.isEncryptionAvailable()) {
    throw new Error('Windows credential protection is unavailable; standalone startup stopped');
  }
  const parsed: unknown = JSON.parse(protection.decryptString(readFileSync(targetPath)));
  if (!validDeviceOwner(parsed)) {
    throw new Error('Protected device-owner credential state is invalid');
  }
  return parsed;
}

export function loadOrCreateDeviceOwnerCredential(
  targetPath: string,
  protection: SecretProtection,
): DeviceOwnerCredential {
  const existing = loadDeviceOwnerCredential(targetPath, protection);
  if (existing) return existing;
  if (!protection.isEncryptionAvailable()) {
    throw new Error('Windows credential protection is unavailable; standalone startup stopped');
  }
  const credential: DeviceOwnerCredential = {
    version: 1,
    identifier: deviceOwnerIdentifier,
    password: randomBytes(33).toString('base64url'),
  };
  writeProtected(targetPath, protection, credential);
  return credential;
}
