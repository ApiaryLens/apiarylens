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
