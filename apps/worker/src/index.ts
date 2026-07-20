import {
  bootstrapRequestSchema,
  buildOpenApiDocument,
  createBuildIdentity,
  DATABASE_MIGRATION_HEAD,
  ExportArchiveError,
  invitationAcceptSchema,
  invitationCreateSchema,
  parseExportArchive,
  recoveryRequestSchema,
  resourceFieldSchemas,
  resourceTypeSchema,
  rolePermissions,
  signInRequestSchema,
  syncPushRequestSchema,
  type ApiError,
  type ParsedExportArchive,
  type ResourceType,
  type Role,
  type SyncOperation,
  type SyncOperationResult,
} from '@apiarylens/contracts';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { Hono, type Context, type MiddlewareHandler, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { hashPassword, keyedHash, opaqueToken, sha256, verifyPassword } from './crypto.js';

interface Bindings {
  DB: D1Database;
  // Optional: a demo/lean deployment may run without media storage (no R2 bucket
  // bound). Media routes degrade cleanly when it is absent; deployments that bind
  // a bucket keep full photo/attachment behaviour.
  MEDIA?: R2Bucket;
  BOOTSTRAP_TOKEN?: string;
  AUTH_ROOT_SECRET?: string;
  SCOUT_OPERATOR_TOKEN?: string;
  APIARYLENS_SOURCE_COMMIT?: string;
  APIARYLENS_BUILD_TIME?: string;
  APIARYLENS_ARTIFACT_IDENTITY?: string;
}

interface Session {
  token: string;
  userId: string;
  identifier: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  timezone: string;
  membershipId: string;
  role: Role;
  csrfHash: string;
  expiresAt: string;
}

interface Variables {
  requestId: string;
  session: Session;
}

interface SessionRow {
  user_id: string;
  identifier: string;
  display_name: string;
  organization_id: string;
  organization_name: string;
  timezone: string;
  membership_id: string;
  role: string;
  csrf_hash: string;
  absolute_expires_at: string;
}

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
const cookieName = '__Host-apiarylens-session';
const now = () => new Date().toISOString();
const mediaKey = (
  organizationId: string,
  mediaId: string,
  variant: 'original' | 'thumbnail' = 'original',
) => `${organizationId}/${mediaId}${variant === 'thumbnail' ? '.thumbnail' : ''}`;
const authRoot = (c: AppContext) => {
  if (!c.env.AUTH_ROOT_SECRET || c.env.AUTH_ROOT_SECRET.length < 32)
    throw new Error('The authentication root secret is not configured');
  return c.env.AUTH_ROOT_SECRET;
};
const rateKey = (c: AppContext, scope: string, identity = '') => {
  const address = c.req.header('cf-connecting-ip') ?? 'unknown';
  return `rate:${scope}:${identity.toLowerCase()}:${address}`;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', secureHeaders());
app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  c.header('x-apiarylens-version', '0.1.0-preview.6');
  c.header('x-api-contract-version', '1.0');
  if (c.req.path.startsWith('/api/') || c.req.path === '/health')
    c.header('cache-control', 'no-store');
  await next();
});

const requireSession: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (
  c,
  next,
) => {
  const token = getCookie(c, cookieName);
  if (!token) return apiError(c, 401, 'authentication_required', 'Sign in is required');
  const session = await findSession(c.env.DB, token, authRoot(c));
  if (!session) return apiError(c, 401, 'session_expired', 'The session is no longer valid');
  c.set('session', session);
  await next();
};

const requireCsrf: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (
  c,
  next,
) => {
  const value = c.req.header('x-csrf-token');
  if (!value || (await sha256(value)) !== c.get('session').csrfHash) {
    return apiError(c, 403, 'csrf_invalid', 'The request could not be verified');
  }
  await next();
};

app.get('/health', (c) => {
  const build = createBuildIdentity({
    deploymentProfile: 'cloudflare',
    ...(c.env.APIARYLENS_SOURCE_COMMIT ? { sourceCommit: c.env.APIARYLENS_SOURCE_COMMIT } : {}),
    ...(c.env.APIARYLENS_BUILD_TIME ? { buildTime: c.env.APIARYLENS_BUILD_TIME } : {}),
    ...(c.env.APIARYLENS_ARTIFACT_IDENTITY
      ? { artifactIdentity: c.env.APIARYLENS_ARTIFACT_IDENTITY }
      : {}),
  });
  return c.json({
    status: 'ok',
    product: build.product,
    version: build.productVersion,
    profile: build.deploymentProfile,
    build,
  });
});
app.get('/api/v1/openapi.json', (c) => c.json(buildOpenApiDocument()));
app.get('/api/v1/bootstrap/status', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT 1 AS present FROM bootstrap_claims WHERE singleton = 1',
  ).first<{ present: number }>();
  return c.json({
    available: !row,
    requiresToken: Boolean(c.env.BOOTSTRAP_TOKEN),
  });
});

app.post('/api/v1/bootstrap', async (c) => {
  const parsed = bootstrapRequestSchema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return apiError(c, 400, 'validation_failed', 'Check the submitted fields');
  const throttle = rateKey(c, 'bootstrap');
  if (!(await signInAllowed(c.env.DB, throttle)))
    return apiError(c, 429, 'request_limited', 'Try again later');
  if (c.env.BOOTSTRAP_TOKEN && parsed.data.bootstrapToken !== c.env.BOOTSTRAP_TOKEN) {
    await recordSignInFailure(c.env.DB, throttle);
    return apiError(
      c,
      403,
      'bootstrap_token_invalid',
      'The deployment bootstrap code is incorrect',
    );
  }
  const claim = await c.env.DB.prepare(
    'SELECT 1 AS present FROM bootstrap_claims WHERE singleton = 1',
  ).first();
  if (claim) return apiError(c, 409, 'bootstrap_closed', 'The first owner already exists');
  const timestamp = now();
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const recoveryCodes = Array.from({ length: 8 }, () => opaqueToken().slice(0, 20));
  const recoveryStatements = await Promise.all(
    recoveryCodes.map(async (code) =>
      c.env.DB.prepare(
        `INSERT INTO recovery_codes(id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), userId, await sha256(code), timestamp),
    ),
  );
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO bootstrap_claims(singleton, claimed_at) VALUES (1, ?)').bind(
        timestamp,
      ),
      c.env.DB.prepare(
        `INSERT INTO users(id, identifier, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        userId,
        parsed.data.identifier.toLowerCase(),
        parsed.data.displayName,
        await hashPassword(parsed.data.password, authRoot(c)),
        timestamp,
        timestamp,
      ),
      c.env.DB.prepare(
        `INSERT INTO organizations(id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        organizationId,
        parsed.data.organizationName,
        parsed.data.timezone,
        timestamp,
        timestamp,
      ),
      c.env.DB.prepare(
        `INSERT INTO memberships(id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?)`,
      ).bind(membershipId, organizationId, userId, timestamp, timestamp),
      ...recoveryStatements,
    ]);
  } catch (caught) {
    const claimed = await c.env.DB.prepare(
      'SELECT 1 AS present FROM bootstrap_claims WHERE singleton = 1',
    ).first();
    if (claimed) return apiError(c, 409, 'bootstrap_closed', 'The first owner already exists');
    throw caught;
  }
  await clearFailures(c.env.DB, throttle);
  const created = await createSession(c.env.DB, userId, organizationId, authRoot(c));
  setSessionCookie(c, created.token);
  return c.json({ ...sessionView(created.session, created.csrfToken), recoveryCodes }, 201);
});

app.post('/api/v1/auth/sign-in', async (c) => {
  const parsed = signInRequestSchema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return apiError(c, 400, 'validation_failed', 'Check the submitted fields');
  const addressThrottle = rateKey(c, 'sign-in');
  if (
    !(await signInAllowed(c.env.DB, parsed.data.identifier)) ||
    !(await signInAllowed(c.env.DB, addressThrottle))
  )
    return apiError(c, 401, 'invalid_credentials', 'The identifier or password is incorrect');
  const credential = await c.env.DB.prepare(
    `SELECT u.id, u.password_hash, m.organization_id FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.identifier = ? COLLATE NOCASE AND u.disabled_at IS NULL AND m.status = 'active' LIMIT 1`,
  )
    .bind(parsed.data.identifier)
    .first<{ id: string; password_hash: string; organization_id: string }>();
  if (
    !credential ||
    !(await verifyPassword(parsed.data.password, credential.password_hash, authRoot(c)))
  ) {
    await recordSignInFailure(c.env.DB, parsed.data.identifier);
    await recordSignInFailure(c.env.DB, addressThrottle);
    return apiError(c, 401, 'invalid_credentials', 'The identifier or password is incorrect');
  }
  if (!credential.password_hash.startsWith('pbkdf2-sha256-v2$')) {
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(await hashPassword(parsed.data.password, authRoot(c)), now(), credential.id)
      .run();
  }
  await Promise.all([
    clearFailures(c.env.DB, parsed.data.identifier),
    clearFailures(c.env.DB, addressThrottle),
  ]);
  const created = await createSession(
    c.env.DB,
    credential.id,
    credential.organization_id,
    authRoot(c),
  );
  setSessionCookie(c, created.token);
  return c.json(sessionView(created.session, created.csrfToken));
});

app.post('/api/v1/invitations/accept', async (c) => {
  const parsed = invitationAcceptSchema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return apiError(c, 400, 'validation_failed', 'Check the submitted fields');
  const throttle = rateKey(c, 'invitation');
  if (!(await signInAllowed(c.env.DB, throttle)))
    return apiError(c, 429, 'request_limited', 'Try again later');
  const invitation = await c.env.DB.prepare(
    `SELECT id, organization_id, identifier, display_name, role
     FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?`,
  )
    .bind(await sha256(parsed.data.token), now())
    .first<{
      id: string;
      organization_id: string;
      identifier: string;
      display_name: string;
      role: 'beekeeper' | 'viewer';
    }>();
  if (!invitation) {
    await recordSignInFailure(c.env.DB, throttle);
    return apiError(c, 400, 'invitation_invalid', 'The invitation is invalid or expired');
  }
  const timestamp = now();
  const userId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users(id, identifier, display_name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      userId,
      invitation.identifier,
      invitation.display_name,
      await hashPassword(parsed.data.password, authRoot(c)),
      timestamp,
      timestamp,
    ),
    c.env.DB.prepare(
      `INSERT INTO memberships(id, organization_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    ).bind(membershipId, invitation.organization_id, userId, invitation.role, timestamp, timestamp),
    c.env.DB.prepare('UPDATE invitations SET accepted_at = ? WHERE id = ?').bind(
      timestamp,
      invitation.id,
    ),
  ]);
  await clearFailures(c.env.DB, throttle);
  const created = await createSession(c.env.DB, userId, invitation.organization_id, authRoot(c));
  setSessionCookie(c, created.token);
  return c.json(sessionView(created.session, created.csrfToken), 201);
});

app.post('/api/v1/auth/recover', async (c) => {
  const parsed = recoveryRequestSchema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return apiError(c, 400, 'validation_failed', 'Check the submitted fields');
  const throttle = rateKey(c, 'recovery', parsed.data.identifier);
  if (!(await signInAllowed(c.env.DB, throttle)))
    return apiError(c, 429, 'request_limited', 'Try again later');
  const recovery = await c.env.DB.prepare(
    `SELECT r.id, r.user_id FROM recovery_codes r JOIN users u ON u.id = r.user_id
     WHERE u.identifier = ? COLLATE NOCASE AND r.code_hash = ?
       AND r.consumed_at IS NULL AND u.disabled_at IS NULL`,
  )
    .bind(parsed.data.identifier, await sha256(parsed.data.recoveryCode))
    .first<{ id: string; user_id: string }>();
  if (!recovery) {
    await recordSignInFailure(c.env.DB, throttle);
    return apiError(c, 400, 'recovery_invalid', 'The recovery information is invalid');
  }
  const timestamp = now();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(
      await hashPassword(parsed.data.newPassword, authRoot(c)),
      timestamp,
      recovery.user_id,
    ),
    c.env.DB.prepare('UPDATE recovery_codes SET consumed_at = ? WHERE id = ?').bind(
      timestamp,
      recovery.id,
    ),
    c.env.DB.prepare(
      'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    ).bind(timestamp, recovery.user_id),
  ]);
  await clearFailures(c.env.DB, throttle);
  return c.body(null, 204);
});

app.get('/api/v1/session', requireSession, async (c) => {
  const sessionToken = opaqueToken();
  const csrfToken = opaqueToken();
  await c.env.DB.prepare('UPDATE sessions SET id_hash = ?, csrf_hash = ? WHERE id_hash IN (?, ?)')
    .bind(
      await keyedHash(sessionToken, authRoot(c)),
      await sha256(csrfToken),
      await keyedHash(c.get('session').token, authRoot(c)),
      await sha256(c.get('session').token),
    )
    .run();
  setSessionCookie(c, sessionToken);
  return c.json(sessionView(c.get('session'), csrfToken));
});

app.post('/api/v1/auth/sign-out', requireSession, requireCsrf, async (c) => {
  await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash IN (?, ?)')
    .bind(
      now(),
      await keyedHash(c.get('session').token, authRoot(c)),
      await sha256(c.get('session').token),
    )
    .run();
  deleteCookie(c, cookieName, { path: '/', secure: true });
  return c.body(null, 204);
});

app.post('/api/v1/session/revoke-others', requireSession, requireCsrf, async (c) => {
  const session = c.get('session');
  const result = await c.env.DB.prepare(
    `UPDATE sessions SET revoked_at = ?
     WHERE user_id = ? AND revoked_at IS NULL AND id_hash NOT IN (?, ?)`,
  )
    .bind(
      now(),
      session.userId,
      await keyedHash(session.token, authRoot(c)),
      await sha256(session.token),
    )
    .run();
  return c.json({ revoked: Number(result.meta.changes ?? 0) });
});

app.get('/api/v1/members', requireSession, async (c) => {
  if (!rolePermissions[c.get('session').role].includes('members:read'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const members = await c.env.DB.prepare(
    `SELECT m.id, m.user_id AS userId, u.identifier, u.display_name AS displayName,
      m.role, m.status, m.created_at AS createdAt, m.updated_at AS updatedAt
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = ? AND m.deleted_at IS NULL ORDER BY u.display_name`,
  )
    .bind(c.get('session').organizationId)
    .all();
  return c.json({ items: members.results });
});

app.delete('/api/v1/members/:membershipId', requireSession, requireCsrf, async (c) => {
  const session = c.get('session');
  if (!rolePermissions[session.role].includes('members:manage'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const membership = await c.env.DB.prepare(
    `SELECT user_id, role FROM memberships
     WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(c.req.param('membershipId'), session.organizationId)
    .first<{ user_id: string; role: string }>();
  if (!membership)
    return apiError(c, 404, 'membership_not_found', 'The family member was not found');
  if (membership.role === 'owner')
    return apiError(c, 409, 'owner_required', 'The family owner cannot be removed');
  const timestamp = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE memberships
       SET status = 'revoked', version = version + 1, updated_at = ?
       WHERE id = ? AND organization_id = ?`,
    ).bind(timestamp, c.req.param('membershipId'), session.organizationId),
    c.env.DB.prepare(
      'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    ).bind(timestamp, membership.user_id),
  ]);
  return c.body(null, 204);
});

app.get('/api/v1/invitations', requireSession, async (c) => {
  const session = c.get('session');
  if (!rolePermissions[session.role].includes('members:manage'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const invitations = await c.env.DB.prepare(
    `SELECT id, identifier, display_name AS displayName, role,
      expires_at AS expiresAt, created_at AS createdAt
     FROM invitations
     WHERE organization_id = ? AND accepted_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC`,
  )
    .bind(session.organizationId, now())
    .all();
  return c.json({ items: invitations.results });
});

app.post('/api/v1/invitations', requireSession, requireCsrf, async (c) => {
  if (!rolePermissions[c.get('session').role].includes('members:manage'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const parsed = invitationCreateSchema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return apiError(c, 400, 'validation_failed', 'Check the submitted fields');
  const token = opaqueToken();
  const expiresAt = new Date(
    Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000,
  ).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO invitations(
      id, organization_id, token_hash, identifier, display_name, role,
      expires_at, created_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      c.get('session').organizationId,
      await sha256(token),
      parsed.data.identifier.toLowerCase(),
      parsed.data.displayName,
      parsed.data.role,
      expiresAt,
      now(),
      c.get('session').userId,
    )
    .run();
  return c.json({ token, expiresAt }, 201);
});

app.delete('/api/v1/invitations/:invitationId', requireSession, requireCsrf, async (c) => {
  const session = c.get('session');
  if (!rolePermissions[session.role].includes('members:manage'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const result = await c.env.DB.prepare(
    `DELETE FROM invitations
     WHERE id = ? AND organization_id = ? AND accepted_at IS NULL`,
  )
    .bind(c.req.param('invitationId'), session.organizationId)
    .run();
  return Number(result.meta.changes) > 0
    ? c.body(null, 204)
    : apiError(c, 404, 'invitation_not_found', 'The invitation was not found');
});

app.post('/api/v1/invitations/:invitationId/replace', requireSession, requireCsrf, async (c) => {
  const session = c.get('session');
  if (!rolePermissions[session.role].includes('members:manage'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const invitation = await c.env.DB.prepare(
    `SELECT identifier, display_name, role FROM invitations
       WHERE id = ? AND organization_id = ? AND accepted_at IS NULL`,
  )
    .bind(c.req.param('invitationId'), session.organizationId)
    .first<{ identifier: string; display_name: string; role: Exclude<Role, 'owner'> }>();
  if (!invitation) return apiError(c, 404, 'invitation_not_found', 'The invitation was not found');
  const token = opaqueToken();
  const timestamp = now();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM invitations WHERE id = ?').bind(c.req.param('invitationId')),
    c.env.DB.prepare(
      `INSERT INTO invitations(
          id, organization_id, token_hash, identifier, display_name, role,
          expires_at, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      session.organizationId,
      await sha256(token),
      invitation.identifier,
      invitation.display_name,
      invitation.role,
      expiresAt,
      timestamp,
      session.userId,
    ),
  ]);
  return c.json({ token, expiresAt }, 201);
});

app.post('/api/v1/sync/push', requireSession, requireCsrf, async (c) => {
  const parsed = syncPushRequestSchema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return apiError(c, 400, 'validation_failed', 'The sync batch is invalid');
  if (!rolePermissions[c.get('session').role].some((permission) => permission.endsWith(':write')))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const results: SyncOperationResult[] = [];
  for (const operation of parsed.data.operations) {
    const result = await applyOperation(c.env.DB, c.get('session'), operation);
    results.push(result);
    if (
      operation.entityType === 'mediaAsset' &&
      operation.action === 'delete' &&
      (result.status === 'accepted' || result.status === 'duplicate')
    ) {
      await Promise.all([
        c.env.MEDIA?.delete(mediaKey(c.get('session').organizationId, operation.entityId)),
        c.env.MEDIA?.delete(
          mediaKey(c.get('session').organizationId, operation.entityId, 'thumbnail'),
        ),
      ]);
    }
  }
  return c.json({ syncContractVersion: 1 as const, results });
});

app.get('/api/v1/sync/pull', requireSession, async (c) => {
  const cursor = Number(c.req.query('cursor') ?? '0');
  const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? '100'), 250));
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit))
    return apiError(c, 400, 'cursor_invalid', 'The synchronization cursor is invalid');
  const response = await c.env.DB.prepare(
    `SELECT sequence, entity_type, entity_id, action, version, changed_at, value_json FROM changes WHERE organization_id = ? AND sequence > ? ORDER BY sequence LIMIT ?`,
  )
    .bind(c.get('session').organizationId, cursor, limit + 1)
    .all<Record<string, unknown>>();
  const hasMore = response.results.length > limit;
  const page = hasMore ? response.results.slice(0, limit) : response.results;
  return c.json({
    syncContractVersion: 1 as const,
    changes: page.map((row) => ({
      sequence: Number(row.sequence),
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      version: Number(row.version),
      changedAt: row.changed_at,
      value: row.value_json ? JSON.parse(String(row.value_json)) : null,
    })),
    nextCursor: String(page.length ? page.at(-1)?.sequence : cursor),
    hasMore,
    fullResyncRequired: false,
  });
});

app.get('/api/v1/resources/:type', requireSession, async (c) => {
  const type = resourceTypeSchema.safeParse(c.req.param('type'));
  if (!type.success) return apiError(c, 404, 'resource_type_unknown', 'Unknown resource type');
  const response = await c.env.DB.prepare(
    `SELECT value_json FROM resources WHERE organization_id = ? AND entity_type = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
  )
    .bind(c.get('session').organizationId, type.data)
    .all<{ value_json: string }>();
  return c.json({ items: response.results.map((row) => JSON.parse(row.value_json)) });
});

app.get('/api/v1/resources/:type/:id', requireSession, async (c) => {
  const type = resourceTypeSchema.safeParse(c.req.param('type'));
  if (!type.success) return apiError(c, 404, 'resource_type_unknown', 'Unknown resource type');
  const item = await resource(
    c.env.DB,
    c.get('session').organizationId,
    type.data,
    c.req.param('id'),
  );
  return item && !item.deletedAt
    ? c.json(item)
    : apiError(c, 404, 'resource_not_found', 'The record was not found');
});

app.put('/api/v1/media/:id/content', requireSession, requireCsrf, async (c) => {
  if (!rolePermissions[c.get('session').role].includes('media:write'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  if (!c.env.MEDIA)
    return apiError(c, 503, 'media_unavailable', 'Media storage is not configured for this deployment');
  const metadata = await resource(
    c.env.DB,
    c.get('session').organizationId,
    'mediaAsset',
    c.req.param('id'),
  );
  if (!metadata || metadata.deletedAt)
    return apiError(c, 404, 'media_not_found', 'The media record was not found');
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 25 * 1024 * 1024)
    return apiError(c, 400, 'media_size_invalid', 'The image size is invalid');
  if (c.req.header('content-type') !== metadata.mediaType)
    return apiError(c, 400, 'media_type_mismatch', 'The image type does not match its metadata');
  if ((await sha256(bytes)) !== metadata.sha256)
    return apiError(c, 400, 'media_integrity_failed', 'The image integrity check failed');
  await c.env.MEDIA.put(mediaKey(c.get('session').organizationId, c.req.param('id')), bytes, {
    httpMetadata: { contentType: String(metadata.mediaType) },
    customMetadata: { sha256: String(metadata.sha256) },
  });
  const updated = {
    ...metadata,
    state: 'ready',
    version: Number(metadata.version) + 1,
    updatedAt: now(),
  };
  await recordServerUpdate(
    c.env.DB,
    c.get('session').organizationId,
    'mediaAsset',
    c.req.param('id'),
    updated,
  );
  return c.json(updated);
});

app.put('/api/v1/media/:id/thumbnail', requireSession, requireCsrf, async (c) => {
  if (!rolePermissions[c.get('session').role].includes('media:write'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  if (!c.env.MEDIA)
    return apiError(c, 503, 'media_unavailable', 'Media storage is not configured for this deployment');
  const metadata = await resource(
    c.env.DB,
    c.get('session').organizationId,
    'mediaAsset',
    c.req.param('id'),
  );
  if (!metadata || metadata.deletedAt)
    return apiError(c, 404, 'media_not_found', 'The media record was not found');
  const bytes = await c.req.arrayBuffer();
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > 512 * 1024 ||
    c.req.header('content-type') !== 'image/jpeg'
  )
    return apiError(
      c,
      400,
      'thumbnail_invalid',
      'The thumbnail must be a JPEG no larger than 512 KB',
    );
  await c.env.MEDIA.put(
    mediaKey(c.get('session').organizationId, c.req.param('id'), 'thumbnail'),
    bytes,
    {
      httpMetadata: { contentType: 'image/jpeg' },
    },
  );
  return c.body(null, 204);
});

app.get('/api/v1/media/:id/content', requireSession, async (c) => {
  if (!rolePermissions[c.get('session').role].includes('media:read'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  if (!c.env.MEDIA)
    return apiError(c, 503, 'media_unavailable', 'Media storage is not configured for this deployment');
  const metadata = await resource(
    c.env.DB,
    c.get('session').organizationId,
    'mediaAsset',
    c.req.param('id'),
  );
  if (!metadata || metadata.deletedAt)
    return apiError(c, 404, 'media_not_found', 'The media record was not found');
  const thumbnail = c.req.query('variant') === 'thumbnail';
  const object =
    (await c.env.MEDIA.get(
      mediaKey(
        c.get('session').organizationId,
        c.req.param('id'),
        thumbnail ? 'thumbnail' : 'original',
      ),
    )) ??
    (thumbnail
      ? await c.env.MEDIA.get(mediaKey(c.get('session').organizationId, c.req.param('id')))
      : null);
  if (!object) return apiError(c, 404, 'media_content_missing', 'The image content was not found');
  return new Response(object.body, {
    headers: {
      'content-type': thumbnail ? 'image/jpeg' : String(metadata.mediaType),
      'cache-control': 'private, max-age=3600',
    },
  });
});

app.delete('/api/v1/media/:id/content', requireSession, requireCsrf, async (c) => {
  if (!rolePermissions[c.get('session').role].includes('media:write'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const metadata = await resource(
    c.env.DB,
    c.get('session').organizationId,
    'mediaAsset',
    c.req.param('id'),
  );
  if (!metadata || metadata.deletedAt)
    return apiError(c, 404, 'media_not_found', 'The media record was not found');
  await c.env.MEDIA?.delete(mediaKey(c.get('session').organizationId, c.req.param('id')));
  await c.env.MEDIA?.delete(
    mediaKey(c.get('session').organizationId, c.req.param('id'), 'thumbnail'),
  );
  const updated = {
    ...metadata,
    state: 'deleted',
    version: Number(metadata.version) + 1,
    updatedAt: now(),
  };
  await recordServerUpdate(
    c.env.DB,
    c.get('session').organizationId,
    'mediaAsset',
    c.req.param('id'),
    updated,
  );
  return c.body(null, 204);
});

app.get('/api/v1/export/full', requireSession, async (c) => {
  if (!rolePermissions[c.get('session').role].includes('export:complete'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const resources: Partial<Record<ResourceType, Array<Record<string, unknown>>>> = {};
  for (const type of resourceTypeSchema.options) {
    const response = await c.env.DB.prepare(
      `SELECT value_json FROM resources WHERE organization_id = ? AND entity_type = ? AND deleted_at IS NULL`,
    )
      .bind(c.get('session').organizationId, type)
      .all<{ value_json: string }>();
    resources[type] = response.results.map((row) => JSON.parse(row.value_json));
  }
  const dataBytes = strToU8(JSON.stringify(resources, null, 2));
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(
      JSON.stringify(
        {
          product: 'ApiaryLens',
          productVersion: '0.1.0-preview.6',
          exportFormat: 1,
          profile: 'cloudflare',
          exportedAt: now(),
          // Restore verifies this checksum before touching any data.
          dataSha256: await sha256(dataBytes),
        },
        null,
        2,
      ),
    ),
    'data.json': dataBytes,
  };
  for (const type of ['apiary', 'hive', 'inspection'] as const) {
    files[`csv/${type}.csv`] = strToU8(toCsv(resources[type] ?? []));
  }
  for (const metadata of resources.mediaAsset ?? []) {
    // Deployments without media storage simply omit media bytes from the export.
    const object = await c.env.MEDIA?.get(
      mediaKey(c.get('session').organizationId, String(metadata.id)),
    );
    if (object)
      files[`media/${String(metadata.id)}/${safeFileName(String(metadata.fileName))}`] =
        new Uint8Array(await object.arrayBuffer());
  }
  const archive = zipSync(files, { level: 6 });
  return new Response(archive.buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="apiarylens-export.zip"',
      'cache-control': 'no-store',
    },
  });
});

// Restore a full-export archive over the organization's records (WEB-001).
// Mirrors the Node profile: full verification before any change, tombstones
// plus upserts through versioned change rows so replicas converge through the
// ordinary sync pull. D1 has no cross-batch transaction, so statements are
// applied in chunked batches after validation has fully passed.
app.post('/api/v1/import/full', requireSession, requireCsrf, async (c) => {
  if (!rolePermissions[c.get('session').role].includes('backup:operate'))
    return apiError(c, 403, 'permission_denied', 'You do not have permission for this action');
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 256 * 1024 * 1024)
    return apiError(c, 400, 'import_invalid', 'The uploaded backup file is empty or too large');
  let archive: Record<string, Uint8Array>;
  try {
    archive = boundedUnzip(bytes);
  } catch (caught) {
    if (caught instanceof ArchiveBoundsError)
      return apiError(c, 400, 'import_too_large', caught.message);
    return apiError(
      c,
      400,
      'import_invalid',
      'The file is not a readable ApiaryLens backup archive',
    );
  }
  let parsed: ParsedExportArchive;
  try {
    parsed = await parseExportArchive(archive, sha256);
  } catch (caught) {
    if (caught instanceof ExportArchiveError)
      return apiError(
        c,
        400,
        caught.code === 'corrupt' ? 'import_corrupt' : 'import_invalid',
        caught.message,
      );
    throw caught;
  }
  for (const record of parsed.records.mediaAsset) {
    if (parsed.missingMediaIds.includes(record.id)) {
      record.fields = { ...record.fields, state: 'failed' };
    }
  }
  const organizationId = c.get('session').organizationId;
  // Stage the archive's verified media BEFORE the record batches so a storage
  // failure surfaces while the previous records are still intact. Staged
  // blobs are either identical replacements (the archive sha was verified
  // against the record itself) or unreferenced until the records land.
  try {
    for (const [mediaId, mediaContent] of parsed.mediaBytes) {
      // A deployment without media storage cannot restore an archive that
      // carries media; fail before touching records so nothing is half-restored.
      if (!c.env.MEDIA)
        return apiError(
          c,
          503,
          'media_unavailable',
          'This deployment has no media storage; the archive contains media that cannot be restored.',
        );
      // Drop any pre-restore thumbnail so a stale derivative never outlives
      // the restored original; clients regenerate on demand.
      await c.env.MEDIA.delete(mediaKey(organizationId, mediaId, 'thumbnail'));
      await c.env.MEDIA.put(mediaKey(organizationId, mediaId), mediaContent, {
        httpMetadata: {
          contentType: String(
            parsed.records.mediaAsset.find((record) => record.id === mediaId)?.fields.mediaType ??
              'application/octet-stream',
          ),
        },
      });
    }
  } catch {
    return apiError(
      c,
      400,
      'import_media_failed',
      'The photos could not be written to storage. Nothing was restored.',
    );
  }
  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  const removedMediaIds: string[] = [];
  let imported = 0;
  let removed = 0;
  for (const entityType of resourceTypeSchema.options) {
    const incoming = parsed.records[entityType];
    const incomingIds = new Set(incoming.map((record) => record.id));
    const response = await c.env.DB.prepare(
      `SELECT id, version, value_json, deleted_at FROM resources WHERE organization_id = ? AND entity_type = ?`,
    )
      .bind(organizationId, entityType)
      .all<{ id: string; version: number; value_json: string; deleted_at: string | null }>();
    const versions = new Map(response.results.map((row) => [row.id, Number(row.version)]));
    for (const row of response.results) {
      if (row.deleted_at !== null || incomingIds.has(row.id)) continue;
      const version = Number(row.version) + 1;
      const value = {
        ...(JSON.parse(row.value_json) as Record<string, unknown>),
        version,
        updatedAt: timestamp,
        deletedAt: timestamp,
      };
      statements.push(
        c.env.DB.prepare(
          `UPDATE resources SET version = ?, value_json = ?, updated_at = ?, deleted_at = ? WHERE organization_id = ? AND entity_type = ? AND id = ?`,
        ).bind(
          version,
          JSON.stringify(value),
          timestamp,
          timestamp,
          organizationId,
          entityType,
          row.id,
        ),
        c.env.DB.prepare(
          `INSERT INTO changes(organization_id, entity_type, entity_id, action, version, changed_at, value_json) VALUES (?, ?, ?, 'delete', ?, ?, NULL)`,
        ).bind(organizationId, entityType, row.id, version, timestamp),
      );
      removed += 1;
      if (entityType === 'mediaAsset') removedMediaIds.push(row.id);
    }
    for (const record of incoming) {
      const version = (versions.get(record.id) ?? 0) + 1;
      const value = {
        ...record.fields,
        id: record.id,
        organizationId,
        version,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        deletedAt: null,
      };
      const serialized = JSON.stringify(value);
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO resources(organization_id, entity_type, id, version, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(organization_id, entity_type, id) DO UPDATE SET version=excluded.version, value_json=excluded.value_json, updated_at=excluded.updated_at, deleted_at=NULL`,
        ).bind(
          organizationId,
          entityType,
          record.id,
          version,
          serialized,
          record.createdAt,
          record.updatedAt,
        ),
        c.env.DB.prepare(
          `INSERT INTO changes(organization_id, entity_type, entity_id, action, version, changed_at, value_json) VALUES (?, ?, ?, 'upsert', ?, ?, ?)`,
        ).bind(organizationId, entityType, record.id, version, timestamp, serialized),
      );
      imported += 1;
    }
  }
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO audit_events(id, organization_id, actor_user_id, action, target_type, target_id, result, created_at) VALUES (?, ?, ?, 'data.import', 'organization', ?, 'success', ?)`,
    ).bind(crypto.randomUUID(), organizationId, c.get('session').userId, organizationId, timestamp),
  );
  await runBatches(c.env.DB, statements);
  // Cleanup after the committed cutover: blobs for records the restore
  // removed, plus stale pre-restore blobs behind imported media ids whose
  // bytes the archive did not carry (staged/failed records) — otherwise
  // post-backup photo content would outlive a restore that promised to
  // replace every photo. Failures here never fail the restore: the affected
  // records are tombstoned (unreachable) or honestly non-ready.
  const staleImportedIds = parsed.records.mediaAsset
    .map((record) => record.id)
    .filter((id) => !parsed.mediaBytes.has(id));
  for (const staleId of [...removedMediaIds, ...staleImportedIds]) {
    await c.env.MEDIA?.delete(mediaKey(organizationId, staleId)).catch(() => undefined);
    await c.env.MEDIA?.delete(mediaKey(organizationId, staleId, 'thumbnail')).catch(() => undefined);
  }
  return c.json({
    status: 'restored',
    imported,
    removed,
    mediaFiles: parsed.mediaBytes.size,
    mediaMissing: parsed.missingMediaIds.length,
    restoredAt: now(),
  });
});

app.get('/api/v1/operator/backup', requireScoutOperator, async (c) => {
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(
      JSON.stringify({
        product: 'ApiaryLens',
        productVersion: '0.1.0-preview.6',
        backupFormat: 1,
        databaseMigration: DATABASE_MIGRATION_HEAD,
        profile: 'cloudflare',
        createdAt: now(),
      }),
    ),
  };
  for (const table of backupTables) {
    const response = await c.env.DB.prepare(`SELECT * FROM ${table}`).all<
      Record<string, unknown>
    >();
    files[`database/${table}.json`] = strToU8(JSON.stringify(response.results));
  }
  // Deployments without media storage back up the database only.
  if (c.env.MEDIA) {
    let cursor: string | undefined;
    do {
      const page = await c.env.MEDIA.list(cursor ? { cursor } : {});
      for (const entry of page.objects) {
        const object = await c.env.MEDIA.get(entry.key);
        if (object) files[`media/${entry.key}`] = new Uint8Array(await object.arrayBuffer());
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  const archive = zipSync(files, { level: 6 });
  return new Response(archive.buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="apiarylens-backup-${now().replaceAll(':', '-')}.zip"`,
      'cache-control': 'no-store',
    },
  });
});

app.post('/api/v1/operator/restore', requireScoutOperator, async (c) => {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(await c.req.arrayBuffer()));
    const manifest = JSON.parse(new TextDecoder().decode(archive['manifest.json'])) as {
      product?: string;
      backupFormat?: number;
      databaseMigration?: string;
    };
    if (
      manifest.product !== 'ApiaryLens' ||
      manifest.backupFormat !== 1 ||
      manifest.databaseMigration !== DATABASE_MIGRATION_HEAD
    )
      throw new Error('incompatible backup identity');
  } catch {
    return apiError(c, 400, 'backup_invalid', 'The backup is unreadable or incompatible');
  }

  const rows = new Map<string, Array<Record<string, unknown>>>();
  try {
    for (const table of backupTables) {
      const value = archive[`database/${table}.json`];
      if (!value) throw new Error('missing table');
      const parsed = JSON.parse(new TextDecoder().decode(value));
      if (!Array.isArray(parsed)) throw new Error('invalid table');
      rows.set(table, parsed as Array<Record<string, unknown>>);
    }
  } catch {
    return apiError(c, 400, 'backup_invalid', 'The backup database content is incomplete');
  }

  await runBatches(c.env.DB, [
    c.env.DB.prepare('DELETE FROM sessions'),
    ...[...backupTables].reverse().map((table) => c.env.DB.prepare(`DELETE FROM ${table}`)),
  ]);
  for (const table of backupTables) {
    const allowed = backupColumns[table]!;
    const statements = (rows.get(table) ?? []).map((row) => {
      const columns = allowed.filter((column) => Object.prototype.hasOwnProperty.call(row, column));
      if (columns.length === 0) throw new Error(`empty ${table} row`);
      return c.env.DB.prepare(
        `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      ).bind(...columns.map((column) => row[column] as string | number | null));
    });
    await runBatches(c.env.DB, statements);
  }

  const archiveHasMedia = Object.keys(archive).some((path) => path.startsWith('media/'));
  if (archiveHasMedia && !c.env.MEDIA)
    return apiError(
      c,
      503,
      'media_unavailable',
      'This deployment has no media storage; the backup contains media that cannot be restored.',
    );
  if (c.env.MEDIA) {
    let cursor: string | undefined;
    do {
      const page = await c.env.MEDIA.list(cursor ? { cursor } : {});
      await Promise.all(page.objects.map((entry) => c.env.MEDIA?.delete(entry.key)));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    for (const [path, value] of Object.entries(archive)) {
      if (path.startsWith('media/')) await c.env.MEDIA.put(path.slice('media/'.length), value);
    }
  }
  return c.json({ status: 'ok', restoredAt: now(), sessionsRevoked: true });
});

app.onError((error, c) => {
  const operatorAuthorized =
    Boolean(c.env.SCOUT_OPERATOR_TOKEN) &&
    c.req.header('authorization') === `Bearer ${c.env.SCOUT_OPERATOR_TOKEN}`;
  const diagnosticMessage = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      event: 'request_failed',
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      error: diagnosticMessage,
    }),
  );
  return apiError(
    c,
    500,
    'internal_error',
    operatorAuthorized
      ? `Operator diagnostic: ${diagnosticMessage}`
      : 'The request could not be completed',
  );
});
app.notFound((c) => apiError(c, 404, 'not_found', 'The requested endpoint does not exist'));
export default app;

const backupColumns: Record<string, string[]> = {
  bootstrap_claims: ['singleton', 'claimed_at'],
  organizations: ['id', 'name', 'timezone', 'version', 'created_at', 'updated_at', 'deleted_at'],
  users: [
    'id',
    'identifier',
    'display_name',
    'password_hash',
    'created_at',
    'updated_at',
    'disabled_at',
  ],
  memberships: [
    'id',
    'organization_id',
    'user_id',
    'role',
    'status',
    'version',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  recovery_codes: ['id', 'user_id', 'code_hash', 'created_at', 'consumed_at'],
  resources: [
    'organization_id',
    'entity_type',
    'id',
    'version',
    'value_json',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  changes: [
    'sequence',
    'organization_id',
    'entity_type',
    'entity_id',
    'action',
    'version',
    'changed_at',
    'value_json',
  ],
  idempotency: [
    'organization_id',
    'user_id',
    'operation_id',
    'fingerprint',
    'result_json',
    'created_at',
  ],
  invitations: [
    'id',
    'organization_id',
    'token_hash',
    'identifier',
    'display_name',
    'role',
    'expires_at',
    'created_at',
    'created_by',
    'accepted_at',
  ],
  sign_in_attempts: ['identifier', 'window_started_at', 'failure_count', 'blocked_until'],
  audit_events: [
    'id',
    'organization_id',
    'actor_user_id',
    'action',
    'target_type',
    'target_id',
    'result',
    'created_at',
  ],
};
const backupTables = Object.keys(backupColumns);

/** Refusal raised when a ZIP declares more content than a restore may expand. */
class ArchiveBoundsError extends Error {}

const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;

/**
 * Unzip with bounds on entry count and total declared uncompressed size so a
 * small ZIP bomb cannot exhaust Worker memory before record and media
 * validation can apply their own limits.
 */
function boundedUnzip(bytes: Uint8Array): Record<string, Uint8Array> {
  let entries = 0;
  let expanded = 0;
  return unzipSync(bytes, {
    filter: (file) => {
      entries += 1;
      expanded += file.originalSize;
      if (entries > MAX_ARCHIVE_ENTRIES || expanded > MAX_EXPANDED_BYTES) {
        throw new ArchiveBoundsError(
          'The backup archive declares more content than a restore can safely expand',
        );
      }
      return true;
    },
  });
}

async function requireScoutOperator(c: AppContext, next: Next) {
  const supplied = c.req.header('authorization');
  if (!c.env.SCOUT_OPERATOR_TOKEN || supplied !== `Bearer ${c.env.SCOUT_OPERATOR_TOKEN}`)
    return apiError(c, 404, 'not_found', 'The requested endpoint does not exist');
  await next();
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[]) {
  for (let offset = 0; offset < statements.length; offset += 80)
    await db.batch(statements.slice(offset, offset + 80));
}

async function applyOperation(
  db: D1Database,
  session: Session,
  operation: SyncOperation,
): Promise<SyncOperationResult> {
  const fingerprint = await sha256(JSON.stringify(operation));
  const previous = await db
    .prepare(
      `SELECT fingerprint, result_json FROM idempotency WHERE organization_id = ? AND user_id = ? AND operation_id = ?`,
    )
    .bind(session.organizationId, session.userId, operation.operationId)
    .first<{ fingerprint: string; result_json: string }>();
  if (previous)
    return previous.fingerprint === fingerprint
      ? { ...(JSON.parse(previous.result_json) as SyncOperationResult), status: 'duplicate' }
      : {
          operationId: operation.operationId,
          entityType: operation.entityType,
          entityId: operation.entityId,
          status: 'rejected',
          errorCode: 'idempotency_key_reused',
        };
  const existing = await resource(
    db,
    session.organizationId,
    operation.entityType,
    operation.entityId,
  );
  const existingVersion = existing ? Number(existing.version) : 0;
  const conflict =
    operation.action === 'create'
      ? Boolean(existing)
      : !existing || existingVersion !== operation.baseVersion;
  if (conflict)
    return {
      operationId: operation.operationId,
      entityType: operation.entityType,
      entityId: operation.entityId,
      status: 'conflict',
      ...(existing ? { version: existingVersion, serverValue: existing } : {}),
      ...(operation.payload ? { clientValue: operation.payload } : {}),
    };
  const timestamp = now();
  const version = existingVersion + 1;
  const fields =
    operation.action === 'delete'
      ? (existing ?? {})
      : resourceFieldSchemas[operation.entityType].parse(operation.payload);
  const value = {
    ...fields,
    id: operation.entityId,
    organizationId: session.organizationId,
    version,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    deletedAt: operation.action === 'delete' ? timestamp : null,
  };
  const result: SyncOperationResult = {
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    status: 'accepted',
    version,
    serverValue: value,
  };
  await db.batch([
    db
      .prepare(
        `INSERT INTO resources(organization_id, entity_type, id, version, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(organization_id, entity_type, id) DO UPDATE SET version=excluded.version, value_json=excluded.value_json, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
      )
      .bind(
        session.organizationId,
        operation.entityType,
        operation.entityId,
        version,
        JSON.stringify(value),
        String(value.createdAt),
        timestamp,
        value.deletedAt,
      ),
    db
      .prepare(
        `INSERT INTO changes(organization_id, entity_type, entity_id, action, version, changed_at, value_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        session.organizationId,
        operation.entityType,
        operation.entityId,
        operation.action === 'delete' ? 'delete' : 'upsert',
        version,
        timestamp,
        operation.action === 'delete' ? null : JSON.stringify(value),
      ),
    db
      .prepare(
        `INSERT INTO idempotency(organization_id, user_id, operation_id, fingerprint, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        session.organizationId,
        session.userId,
        operation.operationId,
        fingerprint,
        JSON.stringify(result),
        timestamp,
      ),
  ]);
  return result;
}

async function resource(db: D1Database, organizationId: string, type: ResourceType, id: string) {
  const row = await db
    .prepare(
      `SELECT value_json FROM resources WHERE organization_id = ? AND entity_type = ? AND id = ?`,
    )
    .bind(organizationId, type, id)
    .first<{ value_json: string }>();
  return row ? (JSON.parse(row.value_json) as Record<string, unknown>) : undefined;
}

async function recordServerUpdate(
  db: D1Database,
  organizationId: string,
  entityType: ResourceType,
  id: string,
  value: Record<string, unknown>,
) {
  const serialized = JSON.stringify(value);
  await db.batch([
    db
      .prepare(
        `UPDATE resources SET version = ?, value_json = ?, updated_at = ?
       WHERE organization_id = ? AND entity_type = ? AND id = ?`,
      )
      .bind(
        Number(value.version),
        serialized,
        String(value.updatedAt),
        organizationId,
        entityType,
        id,
      ),
    db
      .prepare(
        `INSERT INTO changes(
        organization_id, entity_type, entity_id, action, version, changed_at, value_json
      ) VALUES (?, ?, ?, 'upsert', ?, ?, ?)`,
      )
      .bind(
        organizationId,
        entityType,
        id,
        Number(value.version),
        String(value.updatedAt),
        serialized,
      ),
  ]);
}

async function createSession(
  db: D1Database,
  userId: string,
  organizationId: string,
  authRootSecret: string,
) {
  const token = opaqueToken();
  const csrfToken = opaqueToken();
  const timestamp = Date.now();
  await db
    .prepare(
      `INSERT INTO sessions(id_hash, user_id, organization_id, csrf_hash, created_at, idle_expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      await keyedHash(token, authRootSecret),
      userId,
      organizationId,
      await sha256(csrfToken),
      new Date(timestamp).toISOString(),
      new Date(timestamp + 12 * 60 * 60 * 1000).toISOString(),
      new Date(timestamp + 30 * 24 * 60 * 60 * 1000).toISOString(),
    )
    .run();
  const session = await findSession(db, token, authRootSecret);
  if (!session) throw new Error('New session could not be read');
  return { token, csrfToken, session };
}

async function findSession(
  db: D1Database,
  token: string,
  authRootSecret: string,
): Promise<Session | undefined> {
  const row = await db
    .prepare(
      `SELECT u.id AS user_id, u.identifier, u.display_name, o.id AS organization_id, o.name AS organization_name, o.timezone, m.id AS membership_id, m.role, s.csrf_hash, s.absolute_expires_at FROM sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=s.organization_id JOIN memberships m ON m.user_id=u.id AND m.organization_id=o.id WHERE s.id_hash IN (?, ?) AND s.revoked_at IS NULL AND s.idle_expires_at>? AND s.absolute_expires_at>? AND m.status='active'`,
    )
    .bind(await keyedHash(token, authRootSecret), await sha256(token), now(), now())
    .first<SessionRow>();
  return row
    ? {
        token,
        userId: row.user_id,
        identifier: row.identifier,
        displayName: row.display_name,
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        timezone: row.timezone,
        membershipId: row.membership_id,
        role: row.role as Role,
        csrfHash: row.csrf_hash,
        expiresAt: row.absolute_expires_at,
      }
    : undefined;
}

function sessionView(session: Session, csrfToken: string) {
  const timestamp = now();
  return {
    user: {
      id: session.userId,
      identifier: session.identifier,
      displayName: session.displayName,
      createdAt: timestamp,
      updatedAt: timestamp,
      disabledAt: null,
    },
    organization: {
      id: session.organizationId,
      organizationId: session.organizationId,
      name: session.organizationName,
      timezone: session.timezone,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    },
    membership: {
      id: session.membershipId,
      organizationId: session.organizationId,
      userId: session.userId,
      role: session.role,
      status: 'active',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    },
    csrfToken,
    expiresAt: session.expiresAt,
  };
}

function setSessionCookie(c: AppContext, token: string) {
  setCookie(c, cookieName, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

function apiError(
  c: AppContext,
  status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503,
  code: string,
  message: string,
) {
  return c.json<ApiError>({ code, message, requestId: c.get('requestId') }, status);
}

async function signInAllowed(db: D1Database, identifier: string) {
  const row = await db
    .prepare('SELECT blocked_until FROM sign_in_attempts WHERE identifier = ? COLLATE NOCASE')
    .bind(identifier)
    .first<{ blocked_until: string | null }>();
  return !row || row.blocked_until === null || row.blocked_until <= now();
}

async function recordSignInFailure(db: D1Database, identifier: string) {
  const normalized = identifier.toLowerCase();
  const row = await db
    .prepare(
      `SELECT window_started_at, failure_count FROM sign_in_attempts
       WHERE identifier = ? COLLATE NOCASE`,
    )
    .bind(normalized)
    .first<{ window_started_at: string; failure_count: number }>();
  const timestamp = new Date();
  const windowExpired =
    !row || timestamp.getTime() - Date.parse(row.window_started_at) > 15 * 60 * 1000;
  const failureCount = windowExpired ? 1 : row.failure_count + 1;
  const blockedUntil =
    failureCount >= 5 ? new Date(timestamp.getTime() + 15 * 60 * 1000).toISOString() : null;
  await db
    .prepare(
      `INSERT INTO sign_in_attempts(identifier, window_started_at, failure_count, blocked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(identifier) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         failure_count = excluded.failure_count,
         blocked_until = excluded.blocked_until`,
    )
    .bind(
      normalized,
      windowExpired ? timestamp.toISOString() : row.window_started_at,
      failureCount,
      blockedUntil,
    )
    .run();
}

async function clearFailures(db: D1Database, identifier: string) {
  await db
    .prepare('DELETE FROM sign_in_attempts WHERE identifier = ? COLLATE NOCASE')
    .bind(identifier)
    .run();
}

function safeFileName(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'image';
}

function toCsv(records: Array<Record<string, unknown>>) {
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
