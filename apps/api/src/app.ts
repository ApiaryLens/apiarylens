import { createHash, randomUUID } from 'node:crypto';
import {
  bootstrapRequestSchema,
  buildOpenApiDocument,
  createBuildIdentity,
  ExportArchiveError,
  invitationAcceptSchema,
  invitationCreateSchema,
  parseExportArchive,
  recoveryRequestSchema,
  resourceTypeSchema,
  rolePermissions,
  signInRequestSchema,
  syncPushRequestSchema,
  type ApiError,
  type BuildIdentity,
  type ParsedExportArchive,
  type Permission,
  type ResourceType,
  type SessionView,
} from '@apiarylens/contracts';
import { SqliteStore, StoreError, type AuthenticatedSession } from '@apiarylens/database';
import { MemoryMediaStore, type MediaStore } from '@apiarylens/media';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { hashPassword, verifyPassword } from './password.js';

interface Variables {
  requestId: string;
  session: AuthenticatedSession;
  sessionToken: string;
}

interface ApiOptions {
  store: SqliteStore;
  mediaStore?: MediaStore;
  secureCookies?: boolean;
  buildIdentity?: BuildIdentity;
  bootstrapToken?: string;
  authRootSecret?: string;
}

function error(
  c: Context<{ Variables: Variables }>,
  status: 400 | 401 | 403 | 404 | 409 | 429,
  code: string,
  message: string,
) {
  return c.json<ApiError>({ code, message, requestId: c.get('requestId') }, status);
}

function sessionView(session: AuthenticatedSession, csrfToken: string): SessionView {
  return {
    user: session.user,
    organization: session.organization,
    membership: session.membership,
    csrfToken,
    expiresAt: session.expiresAt,
  };
}

export function createApi(options: ApiOptions) {
  const app = new Hono<{ Variables: Variables }>();
  const { store } = options;
  const mediaStore = options.mediaStore ?? new MemoryMediaStore();
  const secure = options.secureCookies ?? true;
  const buildIdentity =
    options.buildIdentity ?? createBuildIdentity({ deploymentProfile: 'development' });
  const authRootSecret = options.authRootSecret ?? 'apiarylens-development-auth-root-secret';
  const sessionCookie = secure ? '__Host-apiarylens-session' : 'apiarylens-session';
  const rateKey = (c: Context, scope: string, identity = '') => {
    const address =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';
    return `rate:${scope}:${identity.toLowerCase()}:${address}`;
  };

  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? randomUUID();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    c.header('x-apiarylens-version', '0.1.0-preview.6');
    c.header('x-api-contract-version', '1.0');
    if (c.req.path.startsWith('/api/')) c.header('cache-control', 'no-store');
    await next();
  });

  const requireSession: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
    const sessionToken = getCookie(c, sessionCookie);
    if (!sessionToken) return error(c, 401, 'authentication_required', 'Sign in is required');
    const session = store.getSession(sessionToken);
    if (!session) return error(c, 401, 'session_expired', 'The session is no longer valid');
    c.set('session', session);
    c.set('sessionToken', sessionToken);
    await next();
  };

  const requireCsrf: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
    const csrfToken = c.req.header('x-csrf-token');
    if (!csrfToken || !store.checkCsrf(c.get('session'), csrfToken)) {
      return error(c, 403, 'csrf_invalid', 'The request could not be verified');
    }
    await next();
  };

  const permit =
    (permission: Permission): MiddlewareHandler<{ Variables: Variables }> =>
    async (c, next) => {
      if (!rolePermissions[c.get('session').membership.role].includes(permission)) {
        return error(c, 403, 'permission_denied', 'You do not have permission for this action');
      }
      await next();
    };

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      product: buildIdentity.product,
      version: buildIdentity.productVersion,
      build: buildIdentity,
    }),
  );
  app.get('/api/v1/openapi.json', (c) => c.json(buildOpenApiDocument()));

  app.get('/api/v1/bootstrap/status', (c) =>
    c.json({ available: !store.hasOwner(), requiresToken: Boolean(options.bootstrapToken) }),
  );

  app.post('/api/v1/bootstrap', async (c) => {
    const parsed = bootstrapRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return error(c, 400, 'validation_failed', 'Check the submitted fields');
    const throttle = rateKey(c, 'bootstrap');
    if (!store.signInAllowed(throttle)) return error(c, 429, 'request_limited', 'Try again later');
    if (options.bootstrapToken && parsed.data.bootstrapToken !== options.bootstrapToken) {
      store.recordSignInFailure(throttle);
      return error(c, 403, 'bootstrap_token_invalid', 'The deployment bootstrap code is incorrect');
    }
    try {
      const tokens = store.bootstrap({
        ...parsed.data,
        passwordHash: await hashPassword(parsed.data.password, authRootSecret),
      });
      store.clearSignInFailures(throttle);
      setCookie(c, sessionCookie, tokens.sessionToken, {
        httpOnly: true,
        secure,
        sameSite: 'Strict',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
      return c.json(
        {
          ...sessionView(tokens.view, tokens.csrfToken),
          recoveryCodes: tokens.recoveryCodes,
        },
        201,
      );
    } catch (caught) {
      if (caught instanceof StoreError) return error(c, 409, caught.code, caught.message);
      throw caught;
    }
  });

  app.post('/api/v1/auth/sign-in', async (c) => {
    const parsed = signInRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return error(c, 400, 'validation_failed', 'Check the submitted fields');
    const addressThrottle = rateKey(c, 'sign-in');
    if (!store.signInAllowed(parsed.data.identifier) || !store.signInAllowed(addressThrottle)) {
      return error(c, 401, 'invalid_credentials', 'The identifier or password is incorrect');
    }
    const credential = store.verifyCredentials(parsed.data.identifier);
    if (
      !credential ||
      !(await verifyPassword(parsed.data.password, credential.passwordHash, authRootSecret))
    ) {
      store.recordSignInFailure(parsed.data.identifier);
      store.recordSignInFailure(addressThrottle);
      return error(c, 401, 'invalid_credentials', 'The identifier or password is incorrect');
    }
    if (!credential.passwordHash.startsWith('pbkdf2-sha256-v2$')) {
      store.updatePasswordHash(
        credential.userId,
        await hashPassword(parsed.data.password, authRootSecret),
      );
    }
    store.clearSignInFailures(parsed.data.identifier);
    store.clearSignInFailures(addressThrottle);
    const organizationId = store.activeOrganizationForUser(credential.userId);
    if (!organizationId)
      return error(c, 403, 'membership_required', 'No active family is available');
    const tokens = store.createSession(credential.userId, organizationId);
    setCookie(c, sessionCookie, tokens.sessionToken, {
      httpOnly: true,
      secure,
      sameSite: 'Strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return c.json(sessionView(tokens.view, tokens.csrfToken));
  });

  app.post('/api/v1/invitations/accept', async (c) => {
    const parsed = invitationAcceptSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return error(c, 400, 'validation_failed', 'Check the submitted fields');
    const throttle = rateKey(c, 'invitation');
    if (!store.signInAllowed(throttle)) return error(c, 429, 'request_limited', 'Try again later');
    try {
      const tokens = store.acceptInvitation(
        parsed.data.token,
        await hashPassword(parsed.data.password, authRootSecret),
      );
      store.clearSignInFailures(throttle);
      setCookie(c, sessionCookie, tokens.sessionToken, {
        httpOnly: true,
        secure,
        sameSite: 'Strict',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
      return c.json(sessionView(tokens.view, tokens.csrfToken), 201);
    } catch (caught) {
      if (caught instanceof StoreError) {
        store.recordSignInFailure(throttle);
        return error(c, 400, caught.code, caught.message);
      }
      throw caught;
    }
  });

  app.post('/api/v1/auth/recover', async (c) => {
    const parsed = recoveryRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return error(c, 400, 'validation_failed', 'Check the submitted fields');
    const throttle = rateKey(c, 'recovery', parsed.data.identifier);
    if (!store.signInAllowed(throttle)) return error(c, 429, 'request_limited', 'Try again later');
    try {
      store.recover(
        parsed.data.identifier,
        parsed.data.recoveryCode,
        await hashPassword(parsed.data.newPassword, authRootSecret),
      );
      store.clearSignInFailures(throttle);
      return c.body(null, 204);
    } catch (caught) {
      if (caught instanceof StoreError) {
        store.recordSignInFailure(throttle);
        return error(c, 400, caught.code, caught.message);
      }
      throw caught;
    }
  });

  app.get('/api/v1/session', requireSession, (c) => {
    const tokens = store.rotateSession(c.get('sessionToken'));
    setCookie(c, sessionCookie, tokens.sessionToken, {
      httpOnly: true,
      secure,
      sameSite: 'Strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return c.json(sessionView(tokens.view, tokens.csrfToken));
  });

  app.post('/api/v1/auth/sign-out', requireSession, requireCsrf, (c) => {
    store.revokeSession(c.get('sessionToken'));
    deleteCookie(c, sessionCookie, { path: '/', secure });
    return c.body(null, 204);
  });

  app.post('/api/v1/session/revoke-others', requireSession, requireCsrf, (c) => {
    const session = c.get('session');
    const revoked = store.revokeOtherSessions(c.get('sessionToken'), session.user.id);
    return c.json({ revoked });
  });

  app.get('/api/v1/members', requireSession, permit('members:read'), (c) =>
    c.json({ items: store.listMemberships(c.get('session').organization.id) }),
  );

  app.delete(
    '/api/v1/members/:membershipId',
    requireSession,
    requireCsrf,
    permit('members:manage'),
    (c) => {
      const session = c.get('session');
      try {
        return store.revokeMembership(
          session.organization.id,
          session.user.id,
          c.req.param('membershipId'),
        )
          ? c.body(null, 204)
          : error(c, 404, 'membership_not_found', 'The family member was not found');
      } catch (caught) {
        if (caught instanceof StoreError) return error(c, 409, caught.code, caught.message);
        throw caught;
      }
    },
  );

  app.get('/api/v1/invitations', requireSession, permit('members:manage'), (c) =>
    c.json({ items: store.listPendingInvitations(c.get('session').organization.id) }),
  );

  app.post(
    '/api/v1/invitations',
    requireSession,
    requireCsrf,
    permit('members:manage'),
    async (c) => {
      const parsed = invitationCreateSchema.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return error(c, 400, 'validation_failed', 'Check the submitted fields');
      const session = c.get('session');
      const invitation = store.createInvitation({
        organizationId: session.organization.id,
        createdBy: session.user.id,
        ...parsed.data,
      });
      return c.json(invitation, 201);
    },
  );

  app.delete(
    '/api/v1/invitations/:invitationId',
    requireSession,
    requireCsrf,
    permit('members:manage'),
    (c) => {
      const session = c.get('session');
      return store.revokeInvitation(
        session.organization.id,
        session.user.id,
        c.req.param('invitationId'),
      )
        ? c.body(null, 204)
        : error(c, 404, 'invitation_not_found', 'The invitation was not found');
    },
  );

  app.post(
    '/api/v1/invitations/:invitationId/replace',
    requireSession,
    requireCsrf,
    permit('members:manage'),
    (c) => {
      const session = c.get('session');
      const invitation = store.replaceInvitation(
        session.organization.id,
        session.user.id,
        c.req.param('invitationId'),
      );
      return invitation
        ? c.json(invitation, 201)
        : error(c, 404, 'invitation_not_found', 'The invitation was not found');
    },
  );

  app.post(
    '/api/v1/sync/push',
    requireSession,
    requireCsrf,
    permit('apiaries:write'),
    async (c) => {
      const parsed = syncPushRequestSchema.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return error(c, 400, 'validation_failed', 'The sync batch is invalid');
      const session = c.get('session');
      const results = store.applyOperations(
        session.organization.id,
        session.user.id,
        parsed.data.operations,
      );
      for (const [index, operation] of parsed.data.operations.entries()) {
        if (
          operation.entityType === 'mediaAsset' &&
          operation.action === 'delete' &&
          ['accepted', 'duplicate'].includes(String(results[index]?.status))
        ) {
          await mediaStore.delete(session.organization.id, operation.entityId);
        }
      }
      return c.json({ syncContractVersion: 1 as const, results });
    },
  );

  app.get('/api/v1/sync/pull', requireSession, async (c) => {
    const cursor = Number(c.req.query('cursor') ?? '0');
    const limit = Number(c.req.query('limit') ?? '100');
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit)) {
      return error(c, 400, 'cursor_invalid', 'The synchronization cursor is invalid');
    }
    return c.json(store.pullChanges(c.get('session').organization.id, cursor, limit));
  });

  app.get('/api/v1/resources/:type', requireSession, (c) => {
    const parsed = resourceTypeSchema.safeParse(c.req.param('type'));
    if (!parsed.success) return error(c, 404, 'resource_type_unknown', 'Unknown resource type');
    return c.json({ items: store.listResources(c.get('session').organization.id, parsed.data) });
  });

  app.get('/api/v1/resources/:type/:id', requireSession, (c) => {
    const parsed = resourceTypeSchema.safeParse(c.req.param('type'));
    if (!parsed.success) return error(c, 404, 'resource_type_unknown', 'Unknown resource type');
    const item = store.getResource(
      c.get('session').organization.id,
      parsed.data,
      c.req.param('id'),
    );
    return item && !item.deletedAt
      ? c.json(item)
      : error(c, 404, 'resource_not_found', 'The record was not found');
  });

  app.put(
    '/api/v1/media/:id/content',
    requireSession,
    requireCsrf,
    permit('media:write'),
    async (c) => {
      const session = c.get('session');
      const metadata = store.getResource(session.organization.id, 'mediaAsset', c.req.param('id'));
      if (!metadata || metadata.deletedAt) {
        return error(c, 404, 'media_not_found', 'The media record was not found');
      }
      const declaredLength = Number(c.req.header('content-length') ?? '0');
      if (declaredLength > 25 * 1024 * 1024) {
        return error(c, 400, 'media_too_large', 'Images must be 25 MB or smaller');
      }
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > 25 * 1024 * 1024) {
        return error(c, 400, 'media_size_invalid', 'The image size is invalid');
      }
      if (c.req.header('content-type') !== metadata.mediaType) {
        return error(c, 400, 'media_type_mismatch', 'The image type does not match its metadata');
      }
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== metadata.sha256) {
        return error(c, 400, 'media_integrity_failed', 'The image integrity check failed');
      }
      await mediaStore.put(session.organization.id, metadata.id, bytes);
      const updated = store.patchResource(session.organization.id, 'mediaAsset', metadata.id, {
        state: 'ready',
      });
      return c.json(updated);
    },
  );

  app.put(
    '/api/v1/media/:id/thumbnail',
    requireSession,
    requireCsrf,
    permit('media:write'),
    async (c) => {
      const session = c.get('session');
      const metadata = store.getResource(session.organization.id, 'mediaAsset', c.req.param('id'));
      if (!metadata || metadata.deletedAt)
        return error(c, 404, 'media_not_found', 'The media record was not found');
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (
        bytes.byteLength === 0 ||
        bytes.byteLength > 512 * 1024 ||
        c.req.header('content-type') !== 'image/jpeg'
      ) {
        return error(
          c,
          400,
          'thumbnail_invalid',
          'The thumbnail must be a JPEG no larger than 512 KB',
        );
      }
      await mediaStore.put(session.organization.id, metadata.id, bytes, 'thumbnail');
      return c.body(null, 204);
    },
  );

  app.get('/api/v1/media/:id/content', requireSession, permit('media:read'), async (c) => {
    const session = c.get('session');
    const metadata = store.getResource(session.organization.id, 'mediaAsset', c.req.param('id'));
    if (!metadata || metadata.deletedAt) {
      return error(c, 404, 'media_not_found', 'The media record was not found');
    }
    const thumbnail = c.req.query('variant') === 'thumbnail';
    const bytes =
      (await mediaStore.get(
        session.organization.id,
        metadata.id,
        thumbnail ? 'thumbnail' : 'original',
      )) ?? (thumbnail ? await mediaStore.get(session.organization.id, metadata.id) : undefined);
    if (!bytes) return error(c, 404, 'media_content_missing', 'The image content was not found');
    return new Response(bytes.slice().buffer as ArrayBuffer, {
      headers: {
        'content-type': thumbnail ? 'image/jpeg' : String(metadata.mediaType),
        'content-length': String(bytes.byteLength),
        'cache-control': 'private, max-age=3600',
        'content-disposition': `inline; filename="${encodeURIComponent(String(metadata.fileName))}"`,
      },
    });
  });

  app.delete(
    '/api/v1/media/:id/content',
    requireSession,
    requireCsrf,
    permit('media:write'),
    async (c) => {
      const session = c.get('session');
      const metadata = store.getResource(session.organization.id, 'mediaAsset', c.req.param('id'));
      if (!metadata || metadata.deletedAt) {
        return error(c, 404, 'media_not_found', 'The media record was not found');
      }
      await mediaStore.delete(session.organization.id, metadata.id);
      store.patchResource(session.organization.id, 'mediaAsset', metadata.id, { state: 'deleted' });
      return c.body(null, 204);
    },
  );

  app.get('/api/v1/export/full', requireSession, permit('export:complete'), async (c) => {
    const session = c.get('session');
    const organizationId = session.organization.id;
    const resources = Object.fromEntries(
      resourceTypeSchema.options.map((entityType) => [
        entityType,
        store.listResources(organizationId, entityType),
      ]),
    ) as Record<ResourceType, ReturnType<SqliteStore['listResources']>>;
    const dataBytes = strToU8(JSON.stringify(resources, null, 2));
    const files: Record<string, Uint8Array> = {
      'manifest.json': strToU8(
        JSON.stringify(
          {
            product: 'ApiaryLens',
            productVersion: '0.1.0-preview.6',
            exportFormat: 1,
            exportedAt: new Date().toISOString(),
            organizationId,
            organizationName: session.organization.name,
            // Restore verifies this checksum before touching any data.
            dataSha256: createHash('sha256').update(dataBytes).digest('hex'),
          },
          null,
          2,
        ),
      ),
      'data.json': dataBytes,
    };
    for (const entityType of ['apiary', 'hive', 'inspection'] as const) {
      files[`csv/${entityType}.csv`] = strToU8(toCsv(resources[entityType]));
    }
    for (const metadata of resources.mediaAsset) {
      const bytes = await mediaStore.get(organizationId, metadata.id);
      if (bytes) files[`media/${metadata.id}/${safeFileName(String(metadata.fileName))}`] = bytes;
    }
    const archive = zipSync(files, { level: 6 });
    return new Response(archive.slice().buffer as ArrayBuffer, {
      headers: {
        'content-type': 'application/zip',
        'content-length': String(archive.byteLength),
        'content-disposition': `attachment; filename="apiarylens-export-${new Date().toISOString().slice(0, 10)}.zip"`,
        'cache-control': 'no-store',
      },
    });
  });

  // Restore a full-export archive over the organization's records (WEB-001).
  // The archive is fully verified before anything changes, the replacement is
  // one transaction, and the rewrite happens through ordinary versioned
  // change rows so device replicas converge through their normal sync pull.
  app.post(
    '/api/v1/import/full',
    requireSession,
    requireCsrf,
    permit('backup:operate'),
    async (c) => {
      const declaredLength = Number(c.req.header('content-length') ?? '0');
      if (declaredLength > 256 * 1024 * 1024) {
        return error(
          c,
          400,
          'import_too_large',
          'Backup archives over 256 MB cannot be restored here',
        );
      }
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > 256 * 1024 * 1024) {
        return error(c, 400, 'import_invalid', 'The uploaded backup file is empty or too large');
      }
      let archive: Record<string, Uint8Array>;
      try {
        archive = unzipSync(bytes);
      } catch {
        return error(
          c,
          400,
          'import_invalid',
          'The file is not a readable ApiaryLens backup archive',
        );
      }
      let parsed: ParsedExportArchive;
      try {
        parsed = await parseExportArchive(archive, (value) =>
          createHash('sha256').update(value).digest('hex'),
        );
      } catch (caught) {
        if (caught instanceof ExportArchiveError) {
          return error(
            c,
            400,
            caught.code === 'corrupt' ? 'import_corrupt' : 'import_invalid',
            caught.message,
          );
        }
        throw caught;
      }
      // Honest gap: a record that claims a ready image whose bytes the archive
      // never carried imports as `failed` instead of pretending the image exists.
      for (const record of parsed.records.mediaAsset) {
        if (parsed.missingMediaIds.includes(record.id)) {
          record.fields = { ...record.fields, state: 'failed' };
        }
      }
      const session = c.get('session');
      const organizationId = session.organization.id;
      const result = store.importOrganizationData(organizationId, session.user.id, parsed.records);
      for (const removedId of result.removedMediaIds) {
        await mediaStore.delete(organizationId, removedId);
      }
      for (const [mediaId, mediaContent] of parsed.mediaBytes) {
        // Drop any pre-restore thumbnail so a stale derivative never outlives
        // the restored original; clients regenerate from the original.
        await mediaStore.delete(organizationId, mediaId, 'thumbnail');
        await mediaStore.put(organizationId, mediaId, mediaContent);
      }
      return c.json({
        status: 'restored',
        imported: result.imported,
        removed: result.removed,
        mediaFiles: parsed.mediaBytes.size,
        mediaMissing: parsed.missingMediaIds.length,
        restoredAt: new Date().toISOString(),
      });
    },
  );

  app.notFound((c) => error(c, 404, 'not_found', 'The requested endpoint does not exist'));
  app.onError((caught, c) => {
    console.error(caught);
    return error(c, 400, 'request_failed', 'The request could not be completed');
  });

  return app;
}

function safeFileName(value: string): string {
  const safe = value.replaceAll(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  return safe || 'image';
}

function toCsv(records: Array<Record<string, unknown>>): string {
  if (records.length === 0) return '';
  const keys = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
  const escape = (value: unknown) => {
    const text =
      value === null || value === undefined
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  return `${keys.map(escape).join(',')}\r\n${records
    .map((record) => keys.map((key) => escape(record[key])).join(','))
    .join('\r\n')}\r\n`;
}
