import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BuildIdentity } from '@apiarylens/contracts';

export type WindowsConnectionProfile = {
  schemaVersion: 1;
  profileId: string;
  displayName: string;
  mode: 'connected';
  clientKind: 'windows';
  backendUrl: string;
  deploymentProfile: 'cloudflare' | 'compose';
  provisioningSource: 'scout' | 'manual' | 'ci';
  createdAt: string;
  compatibility: {
    productVersion: string;
    apiContract: string;
    syncContract: number;
    databaseMigration: string;
  };
};

const rootKeys = new Set([
  'schemaVersion',
  'profileId',
  'displayName',
  'mode',
  'clientKind',
  'backendUrl',
  'deploymentProfile',
  'provisioningSource',
  'createdAt',
  'compatibility',
]);
const compatibilityKeys = new Set([
  'productVersion',
  'apiContract',
  'syncContract',
  'databaseMigration',
]);

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function parseConnectionProfile(value: unknown): WindowsConnectionProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Connection profile must be a JSON object');
  const profile = value as Record<string, unknown>;
  if (!hasOnlyKeys(profile, rootKeys))
    throw new Error('Connection profile contains unsupported or secret-shaped fields');
  const compatibility = profile.compatibility;
  if (!compatibility || typeof compatibility !== 'object' || Array.isArray(compatibility))
    throw new Error('Connection profile compatibility is required');
  const compatible = compatibility as Record<string, unknown>;
  if (!hasOnlyKeys(compatible, compatibilityKeys))
    throw new Error('Connection compatibility contains unsupported fields');
  const backend = new URL(String(profile.backendUrl ?? ''));
  if (
    backend.protocol !== 'https:' ||
    backend.username ||
    backend.password ||
    backend.search ||
    backend.hash ||
    (backend.pathname !== '/' && backend.pathname !== '')
  )
    throw new Error('Connected backend must be a credential-free HTTPS origin');
  if (
    profile.schemaVersion !== 1 ||
    typeof profile.profileId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      profile.profileId,
    ) ||
    typeof profile.displayName !== 'string' ||
    profile.displayName.trim().length < 1 ||
    profile.displayName.length > 120 ||
    profile.mode !== 'connected' ||
    profile.clientKind !== 'windows' ||
    (profile.deploymentProfile !== 'cloudflare' && profile.deploymentProfile !== 'compose') ||
    (profile.provisioningSource !== 'scout' &&
      profile.provisioningSource !== 'manual' &&
      profile.provisioningSource !== 'ci') ||
    typeof profile.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(profile.createdAt)) ||
    typeof compatible.productVersion !== 'string' ||
    typeof compatible.apiContract !== 'string' ||
    !Number.isSafeInteger(compatible.syncContract) ||
    typeof compatible.databaseMigration !== 'string'
  )
    throw new Error('Connection profile is invalid or incompatible');
  return {
    schemaVersion: 1,
    profileId: profile.profileId,
    displayName: profile.displayName.trim(),
    mode: 'connected',
    clientKind: 'windows',
    backendUrl: backend.origin,
    deploymentProfile: profile.deploymentProfile,
    provisioningSource: profile.provisioningSource,
    createdAt: new Date(profile.createdAt).toISOString(),
    compatibility: {
      productVersion: compatible.productVersion,
      apiContract: compatible.apiContract,
      syncContract: Number(compatible.syncContract),
      databaseMigration: compatible.databaseMigration,
    },
  };
}

export function readConnectionProfile(path: string): WindowsConnectionProfile {
  const absolute = resolve(path);
  const metadata = statSync(absolute);
  if (!metadata.isFile() || metadata.size > 64 * 1024)
    throw new Error('Connection profile must be a JSON file smaller than 64 KiB');
  return parseConnectionProfile(JSON.parse(readFileSync(absolute, 'utf8')));
}

export function loadSavedConnectionProfile(path: string): WindowsConnectionProfile | undefined {
  try {
    return readConnectionProfile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function saveConnectionProfile(path: string, profile: WindowsConnectionProfile): void {
  const target = resolve(path);
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, target);
}

export function removeConnectionProfile(path: string): void {
  rmSync(resolve(path), { force: true });
}

export async function verifyConnectedBackend(
  profile: WindowsConnectionProfile,
): Promise<BuildIdentity> {
  const response = await fetch(`${profile.backendUrl}/health`, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok || new URL(response.url).origin !== profile.backendUrl)
    throw new Error('Connected backend health verification failed');
  const body = (await response.json()) as { status?: unknown; build?: Partial<BuildIdentity> };
  const build = body.build;
  if (
    body.status !== 'ok' ||
    !build ||
    build.product !== 'ApiaryLens' ||
    build.deploymentProfile !== profile.deploymentProfile ||
    build.productVersion !== profile.compatibility.productVersion ||
    build.apiContract !== profile.compatibility.apiContract ||
    build.syncContract !== profile.compatibility.syncContract ||
    build.databaseMigration !== profile.compatibility.databaseMigration
  )
    throw new Error('Connected backend does not match the imported compatibility lock');
  return build as BuildIdentity;
}
