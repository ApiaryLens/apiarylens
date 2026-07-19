import { describe, expect, it } from 'vitest';
import {
  buildOpenApiDocument,
  deploymentPlanSchema,
  rolePermissions,
  syncPushRequestSchema,
} from './index.js';

describe('contracts', () => {
  it('does not grant write capabilities to viewers', () => {
    expect(rolePermissions.viewer.every((permission) => !permission.endsWith(':write'))).toBe(true);
  });

  it('publishes the implemented identity, resource, and media route security contract', () => {
    const document = buildOpenApiDocument();
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/bootstrap/status',
        '/auth/recover',
        '/session',
        '/session/revoke-others',
        '/auth/sign-out',
        '/members',
        '/resources/{type}/{id}',
        '/media/{id}/thumbnail',
      ]),
    );
    expect(document.paths['/bootstrap'].post.security).toEqual([]);
    expect(document.paths['/auth/sign-in'].post.security).toEqual([]);
    expect(document.paths['/sync/push'].post.security).toEqual([{ browserSession: [], csrf: [] }]);
  });

  it('rejects plaintext Compose URLs', () => {
    const result = deploymentPlanSchema.safeParse({
      schemaVersion: 1,
      planId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      release: {
        version: '0.1.0-rc.1',
        channel: 'release-candidate',
        manifestUrl: 'https://apiarylens.org/releases/0.1.0-rc.1/manifest.json',
        manifestSha256: 'a'.repeat(64),
      },
      operation: 'install',
      target: 'compose-ssh',
      keepDataOnUninstall: true,
      compose: {
        host: 'example.test',
        port: 22,
        user: 'apiarylens',
        targetDirectory: '/opt/apiarylens',
        projectName: 'apiarylens-family',
        publicUrl: 'http://example.test',
        sshHostKeySha256: 'SHA256:abc=',
        backupRetention: 14,
      },
    });
    expect(result.success).toBe(false);
  });

  it('defaults legacy deployment plans to the web application and preserves backend-only selection', () => {
    const base = {
      schemaVersion: 1 as const,
      planId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      release: {
        version: '0.1.0-preview.5',
        channel: 'preview' as const,
        manifestUrl: 'https://apiarylens.org/releases/0.1.0-preview.5/manifest.json',
        manifestSha256: 'a'.repeat(64),
      },
      operation: 'install' as const,
      target: 'cloudflare' as const,
      keepDataOnUninstall: true,
      cloudflare: {
        accountReference: 'account-reference',
        workerName: 'apiarylens-family',
        d1DatabaseName: 'apiarylens-family',
        r2BucketName: 'apiarylens-family-media',
        costProfile: 'family-free-guarded' as const,
      },
    };
    const legacy = deploymentPlanSchema.parse(base);
    const backendOnly = deploymentPlanSchema.parse({
      ...base,
      cloudflare: { ...base.cloudflare, includeWebFrontend: false },
    });
    if (legacy.target !== 'cloudflare' || backendOnly.target !== 'cloudflare') {
      throw new Error('expected Cloudflare deployment plans');
    }
    expect(legacy.cloudflare.includeWebFrontend).toBe(true);
    expect(backendOnly.cloudflare.includeWebFrontend).toBe(false);
  });

  it('bounds synchronization batches', () => {
    const operation = {
      operationId: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      entityType: 'apiary',
      entityId: crypto.randomUUID(),
      action: 'create',
      baseVersion: 0,
      payload: { name: 'Back field' },
      queuedAt: new Date().toISOString(),
    };
    const result = syncPushRequestSchema.safeParse({
      syncContractVersion: 1,
      operations: Array.from({ length: 101 }, () => operation),
    });
    expect(result.success).toBe(false);
  });
});
