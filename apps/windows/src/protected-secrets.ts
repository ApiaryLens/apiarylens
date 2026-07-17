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
  const temporaryPath = join(dirname(targetPath), `.standalone.${process.pid}.tmp`);
  try {
    writeFileSync(temporaryPath, protection.encryptString(JSON.stringify(secrets)), {
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporaryPath, targetPath);
    chmodSync(targetPath, 0o600);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  return secrets;
}
