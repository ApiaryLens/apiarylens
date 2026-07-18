/**
 * Windows client contract layer. The Windows standalone service IS the
 * Compose/Node profile exercised by every other fixture in this package; the
 * additional Windows-only contracts that are testable in CI are the service
 * readiness handshake, the loopback control-token comparison, and the
 * connection profile v1 document. The packaged Electron shell itself cannot
 * run in CI and is covered by the windows-client-verification workflow and
 * owner UAT (documented gap).
 */
import { randomUUID } from 'node:crypto';
import {
  API_CONTRACT_VERSION,
  DATABASE_MIGRATION_HEAD,
  PRODUCT_VERSION,
  SYNC_CONTRACT_VERSION,
  type BuildIdentity,
} from '@apiarylens/contracts';
import { parseConnectionProfile } from '@apiarylens/windows/connected-profile';
import { parseServiceReadiness, safeTokenEqual } from '@apiarylens/windows/service-contract';
import { describe, expect, it } from 'vitest';
import type { ConformanceFixture } from './fixtures/types.js';
import { runConformanceSuite } from './harness/runner.js';

function canonicalProfile(deploymentProfile: 'cloudflare' | 'compose'): Record<string, unknown> {
  return {
    schemaVersion: 1,
    profileId: randomUUID(),
    displayName: 'Conformance connected family',
    mode: 'connected',
    clientKind: 'windows',
    backendUrl: 'https://family.example.test/',
    deploymentProfile,
    provisioningSource: 'ci',
    createdAt: new Date().toISOString(),
    compatibility: {
      productVersion: PRODUCT_VERSION,
      apiContract: API_CONTRACT_VERSION,
      syncContract: SYNC_CONTRACT_VERSION,
      databaseMigration: DATABASE_MIGRATION_HEAD,
    },
  };
}

describe('windows-client contract layer (host side)', () => {
  it('[windows/service.readiness-contract] readiness is accepted only for the owned IPv4 loopback protocol-1 listener', () => {
    const readiness = { pid: 4242, address: '127.0.0.1', port: 49152, serviceProtocolVersion: 1 };
    expect(parseServiceReadiness(readiness, 4242)).toEqual(readiness);

    expect(() => parseServiceReadiness({ ...readiness, pid: 999 }, 4242)).toThrow(
      /owner does not match/,
    );
    for (const address of ['0.0.0.0', '::', '::1', 'localhost']) {
      expect(() => parseServiceReadiness({ ...readiness, address }, 4242)).toThrow(/IPv4 loopback/);
    }
    for (const port of [0, -1, 65_536, 1.5, Number.NaN]) {
      expect(() => parseServiceReadiness({ ...readiness, port }, 4242)).toThrow(/port is invalid/);
    }
    expect(() => parseServiceReadiness({ ...readiness, serviceProtocolVersion: 2 }, 4242)).toThrow(
      /protocol is incompatible/,
    );
  });

  it('[windows/service.control-token] control-token comparison accepts only the exact per-launch secret', () => {
    expect(safeTokenEqual('per-launch-control-secret', 'per-launch-control-secret')).toBe(true);
    expect(safeTokenEqual('per-launch-control-secret', 'per-launch-control-secreT')).toBe(false);
    expect(safeTokenEqual('per-launch-control-secret', 'short')).toBe(false);
    expect(safeTokenEqual('', 'anything')).toBe(false);
  });

  it('[windows/profile.connection-v1] the connection profile schema accepts both deployment profiles and rejects hostile documents', () => {
    for (const deploymentProfile of ['cloudflare', 'compose'] as const) {
      const parsed = parseConnectionProfile(canonicalProfile(deploymentProfile));
      expect(parsed.deploymentProfile).toBe(deploymentProfile);
      expect(parsed.compatibility.syncContract).toBe(SYNC_CONTRACT_VERSION);
    }

    const valid = canonicalProfile('compose');
    const hostile: Array<[string, Record<string, unknown>]> = [
      ['plain-http backend', { ...valid, backendUrl: 'http://family.example.test/' }],
      ['credentialed URL', { ...valid, backendUrl: 'https://user:pass@family.example.test/' }],
      ['query string', { ...valid, backendUrl: 'https://family.example.test/?token=x' }],
      ['pathed URL', { ...valid, backendUrl: 'https://family.example.test/api' }],
      ['secret-shaped extra field', { ...valid, apiToken: 'oops-a-secret' }],
      ['invalid profile id', { ...valid, profileId: 'not-a-uuid' }],
      ['wrong mode', { ...valid, mode: 'standalone' }],
      ['wrong client kind', { ...valid, clientKind: 'web' }],
      [
        'missing compatibility',
        Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'compatibility')),
      ],
    ];
    for (const [label, document] of hostile) {
      expect(() => parseConnectionProfile(document), label).toThrow();
    }
  });
});

const windowsBackendFixtures: readonly ConformanceFixture[] = [
  {
    contract: 'windows/profile.compatibility-identity',
    title: 'the connection profile compatibility block matches the live backend identity',
    async run(world) {
      const deploymentProfile = world.backend.label === 'cloudflare' ? 'cloudflare' : 'compose';
      const profile = parseConnectionProfile(canonicalProfile(deploymentProfile));
      const response = await world.guest().request('/health');
      expect(response.status).toBe(200);
      const body = (await response.json()) as { build: BuildIdentity };
      expect(body.build.productVersion).toBe(profile.compatibility.productVersion);
      expect(body.build.apiContract).toBe(profile.compatibility.apiContract);
      expect(body.build.syncContract).toBe(profile.compatibility.syncContract);
      expect(body.build.databaseMigration).toBe(profile.compatibility.databaseMigration);
      expect(response.headers.get('x-api-contract-version')).toBe(
        profile.compatibility.apiContract,
      );
    },
  },
];

runConformanceSuite('windows-client', windowsBackendFixtures);
