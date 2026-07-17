import { createHash, createHmac, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  Membership,
  Organization,
  ResourceType,
  Role,
  SyncOperation,
  SyncOperationResult,
  User,
} from '@apiarylens/contracts';
import { resourceFieldSchemas } from '@apiarylens/contracts';
import { migration0001, migration0002, migration0003, migration0004 } from './schema.js';

type SqlValue = string | number | null;
type Row = Record<string, SqlValue>;

const migrationHistory = [
  { version: '0001', sql: migration0001 },
  { version: '0002', sql: migration0002 },
  { version: '0003', sql: migration0003 },
  { version: '0004', sql: migration0004 },
] as const;

type MigrationLedgerRow = { version: string; checksum: string };

export interface AuthenticatedSession {
  user: User;
  organization: Organization;
  membership: Membership;
  csrfHash: string;
  expiresAt: string;
}

export interface BootstrapInput {
  identifier: string;
  displayName: string;
  passwordHash: string;
  organizationName: string;
  timezone: string;
}

export interface SessionTokens {
  sessionToken: string;
  csrfToken: string;
  view: AuthenticatedSession;
}

export interface BootstrapResult extends SessionTokens {
  recoveryCodes: string[];
}

export interface InvitationInput {
  organizationId: string;
  createdBy: string;
  identifier: string;
  displayName: string;
  role: Exclude<Role, 'owner'>;
  expiresInHours: number;
}

export interface ResourceRecord {
  id: string;
  organizationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  [key: string]: unknown;
}

const now = () => new Date().toISOString();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => `${randomUUID()}${randomUUID()}`.replaceAll('-', '');

function fromJson(value: SqlValue | undefined): ResourceRecord {
  if (typeof value !== 'string') throw new Error('Expected serialized resource');
  return JSON.parse(value) as ResourceRecord;
}

function entityMeta(
  id: string,
  organizationId: string,
  version: number,
  createdAt: string,
  updatedAt: string,
  deletedAt: string | null,
) {
  return { id, organizationId, version, createdAt, updatedAt, deletedAt };
}

export class SqliteStore {
  readonly database: DatabaseSync;
  private readonly authRootSecret: string;

  constructor(path = ':memory:', options: { authRootSecret?: string } = {}) {
    this.authRootSecret = options.authRootSecret ?? 'apiarylens-development-auth-root-secret';
    this.database = new DatabaseSync(path);
    try {
      this.database.exec('PRAGMA foreign_keys = ON');
      this.applyMigrations();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  private applyMigrations(): void {
    this.transaction(() => {
      const appliedCount = this.validateMigrationLedger(false);
      for (const migration of migrationHistory.slice(appliedCount)) {
        this.database.exec(migration.sql);
        this.database
          .prepare('INSERT INTO migrations(version, applied_at, checksum) VALUES (?, ?, ?)')
          .run(migration.version, now(), hash(migration.sql));
      }
      this.validateMigrationLedger(true);
    });
  }

  private validateMigrationLedger(requireHead: boolean): number {
    const ledgerExists = this.database
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'migrations'",
      )
      .get();
    if (!ledgerExists) {
      if (requireHead) {
        throw new StoreError('migration_ledger_invalid', 'The migration ledger is missing');
      }
      return 0;
    }

    const rows = this.database
      .prepare('SELECT version, checksum FROM migrations ORDER BY rowid')
      .all() as MigrationLedgerRow[];
    const knownVersions = new Set(migrationHistory.map(({ version }) => version));

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const expected = migrationHistory[index];
      if (!row) {
        throw new StoreError('migration_ledger_invalid', 'The migration ledger is unreadable');
      }
      if (!knownVersions.has(row.version as (typeof migrationHistory)[number]['version'])) {
        throw new StoreError(
          'migration_ledger_invalid',
          `The migration ledger contains unknown version ${row.version}`,
        );
      }
      if (!expected) {
        throw new StoreError('migration_ledger_invalid', 'The migration ledger is too long');
      }
      if (row.version !== expected.version) {
        throw new StoreError(
          'migration_ledger_invalid',
          `The migration ledger is skipped or out of order: expected ${expected.version} but found ${row.version}`,
        );
      }
      if (row.checksum !== hash(expected.sql)) {
        throw new StoreError(
          'migration_checksum_mismatch',
          `The recorded checksum for migration ${row.version} does not match the release`,
        );
      }
    }

    if (requireHead && rows.length !== migrationHistory.length) {
      throw new StoreError(
        'migration_ledger_invalid',
        `The migration ledger stopped at ${rows.at(-1)?.version ?? 'no version'}`,
      );
    }

    return rows.length;
  }

  private sessionHash(value: string): string {
    return createHmac('sha256', this.authRootSecret).update(`session\0${value}`).digest('hex');
  }

  private sessionHashes(value: string): [string, string] {
    return [this.sessionHash(value), hash(value)];
  }

  close(): void {
    this.database.close();
  }

  hasOwner(): boolean {
    const row = this.database
      .prepare('SELECT 1 AS present FROM bootstrap_claims WHERE singleton = 1')
      .get() as Row | undefined;
    return row !== undefined;
  }

  bootstrap(input: BootstrapInput): BootstrapResult {
    const timestamp = now();
    const userId = randomUUID();
    const organizationId = randomUUID();
    const membershipId = randomUUID();

    const recoveryCodes = Array.from({ length: 8 }, () => token().slice(0, 20));
    this.transaction(() => {
      const claim = this.database
        .prepare('INSERT OR IGNORE INTO bootstrap_claims(singleton, claimed_at) VALUES (1, ?)')
        .run(timestamp);
      if (claim.changes !== 1)
        throw new StoreError('bootstrap_closed', 'The first owner already exists');
      this.database
        .prepare(
          `INSERT INTO users(id, identifier, display_name, password_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          input.identifier.toLowerCase(),
          input.displayName,
          input.passwordHash,
          timestamp,
          timestamp,
        );
      this.database
        .prepare(
          `INSERT INTO organizations(id, name, timezone, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(organizationId, input.organizationName, input.timezone, timestamp, timestamp);
      this.database
        .prepare(
          `INSERT INTO memberships(
             id, organization_id, user_id, role, status, created_at, updated_at
           ) VALUES (?, ?, ?, 'owner', 'active', ?, ?)`,
        )
        .run(membershipId, organizationId, userId, timestamp, timestamp);
      const recoveryStatement = this.database.prepare(
        `INSERT INTO recovery_codes(id, user_id, code_hash, created_at)
         VALUES (?, ?, ?, ?)`,
      );
      for (const recoveryCode of recoveryCodes) {
        recoveryStatement.run(randomUUID(), userId, hash(recoveryCode), timestamp);
      }
      this.audit(
        organizationId,
        userId,
        'owner.bootstrap',
        'organization',
        organizationId,
        'success',
      );
    });

    return { ...this.createSession(userId, organizationId), recoveryCodes };
  }

  createInvitation(input: InvitationInput): { token: string; expiresAt: string } {
    const invitationToken = token();
    const timestamp = now();
    const expiresAt = new Date(
      Date.now() + Math.max(1, Math.min(input.expiresInHours, 168)) * 60 * 60 * 1000,
    ).toISOString();
    this.database
      .prepare(
        `INSERT INTO invitations(
          id, organization_id, token_hash, identifier, display_name, role,
          expires_at, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.organizationId,
        hash(invitationToken),
        input.identifier.toLowerCase(),
        input.displayName,
        input.role,
        expiresAt,
        timestamp,
        input.createdBy,
      );
    this.audit(
      input.organizationId,
      input.createdBy,
      'invitation.create',
      'membership',
      null,
      'success',
    );
    return { token: invitationToken, expiresAt };
  }

  acceptInvitation(invitationToken: string, passwordHash: string): SessionTokens {
    const row = this.database
      .prepare(
        `SELECT id, organization_id, identifier, display_name, role
         FROM invitations
         WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?`,
      )
      .get(hash(invitationToken), now()) as Row | undefined;
    if (!row) throw new StoreError('invitation_invalid', 'The invitation is invalid or expired');
    const userId = randomUUID();
    const membershipId = randomUUID();
    const timestamp = now();
    const organizationId = String(row.organization_id);
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO users(id, identifier, display_name, password_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          String(row.identifier),
          String(row.display_name),
          passwordHash,
          timestamp,
          timestamp,
        );
      this.database
        .prepare(
          `INSERT INTO memberships(
            id, organization_id, user_id, role, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(membershipId, organizationId, userId, String(row.role), timestamp, timestamp);
      this.database
        .prepare('UPDATE invitations SET accepted_at = ? WHERE id = ?')
        .run(timestamp, String(row.id));
      this.audit(
        organizationId,
        userId,
        'invitation.accept',
        'membership',
        membershipId,
        'success',
      );
    });
    return this.createSession(userId, organizationId);
  }

  recover(identifier: string, recoveryCode: string, passwordHash: string): void {
    const row = this.database
      .prepare(
        `SELECT r.id AS recovery_id, r.user_id
         FROM recovery_codes r JOIN users u ON u.id = r.user_id
         WHERE u.identifier = ? COLLATE NOCASE AND r.code_hash = ?
           AND r.consumed_at IS NULL AND u.disabled_at IS NULL`,
      )
      .get(identifier, hash(recoveryCode)) as Row | undefined;
    if (!row) throw new StoreError('recovery_invalid', 'The recovery information is invalid');
    const timestamp = now();
    const userId = String(row.user_id);
    this.transaction(() => {
      this.database
        .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(passwordHash, timestamp, userId);
      this.database
        .prepare('UPDATE recovery_codes SET consumed_at = ? WHERE id = ?')
        .run(timestamp, String(row.recovery_id));
      this.database
        .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .run(timestamp, userId);
      const organizationId = this.activeOrganizationForUser(userId) ?? null;
      this.audit(organizationId, userId, 'account.recover', 'user', userId, 'success');
    });
  }

  listMemberships(organizationId: string) {
    return this.database
      .prepare(
        `SELECT m.id, m.user_id AS userId, u.identifier, u.display_name AS displayName,
          m.role, m.status, m.created_at AS createdAt, m.updated_at AS updatedAt
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = ? AND m.deleted_at IS NULL ORDER BY u.display_name`,
      )
      .all(organizationId);
  }

  listPendingInvitations(organizationId: string) {
    return this.database
      .prepare(
        `SELECT id, identifier, display_name AS displayName, role,
          expires_at AS expiresAt, created_at AS createdAt
         FROM invitations
         WHERE organization_id = ? AND accepted_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC`,
      )
      .all(organizationId, now());
  }

  revokeMembership(organizationId: string, actorUserId: string, membershipId: string): boolean {
    const row = this.database
      .prepare(
        `SELECT user_id, role, status FROM memberships
         WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
      )
      .get(membershipId, organizationId) as Row | undefined;
    if (!row) return false;
    if (row.role === 'owner') {
      throw new StoreError('owner_required', 'The family owner cannot be removed');
    }
    const timestamp = now();
    this.transaction(() => {
      this.database
        .prepare(
          `UPDATE memberships
           SET status = 'revoked', version = version + 1, updated_at = ?
           WHERE id = ? AND organization_id = ?`,
        )
        .run(timestamp, membershipId, organizationId);
      this.database
        .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .run(timestamp, String(row.user_id));
      this.audit(
        organizationId,
        actorUserId,
        'membership.revoke',
        'membership',
        membershipId,
        'success',
      );
    });
    return true;
  }

  revokeInvitation(organizationId: string, actorUserId: string, invitationId: string): boolean {
    const result = this.database
      .prepare(
        `DELETE FROM invitations
         WHERE id = ? AND organization_id = ? AND accepted_at IS NULL`,
      )
      .run(invitationId, organizationId);
    if (Number(result.changes) === 0) return false;
    this.audit(
      organizationId,
      actorUserId,
      'invitation.revoke',
      'membership',
      invitationId,
      'success',
    );
    return true;
  }

  replaceInvitation(
    organizationId: string,
    actorUserId: string,
    invitationId: string,
  ): { token: string; expiresAt: string } | undefined {
    const row = this.database
      .prepare(
        `SELECT identifier, display_name, role FROM invitations
         WHERE id = ? AND organization_id = ? AND accepted_at IS NULL`,
      )
      .get(invitationId, organizationId) as Row | undefined;
    if (!row) return undefined;
    let replacement: { token: string; expiresAt: string } | undefined;
    this.transaction(() => {
      this.database.prepare('DELETE FROM invitations WHERE id = ?').run(invitationId);
      replacement = this.createInvitation({
        organizationId,
        createdBy: actorUserId,
        identifier: String(row.identifier),
        displayName: String(row.display_name),
        role: String(row.role) as Exclude<Role, 'owner'>,
        expiresInHours: 48,
      });
    });
    return replacement;
  }

  verifyCredentials(identifier: string): { userId: string; passwordHash: string } | undefined {
    const row = this.database
      .prepare(
        `SELECT id, password_hash FROM users
         WHERE identifier = ? COLLATE NOCASE AND disabled_at IS NULL`,
      )
      .get(identifier) as Row | undefined;
    if (!row || typeof row.id !== 'string' || typeof row.password_hash !== 'string')
      return undefined;
    return { userId: row.id, passwordHash: row.password_hash };
  }

  updatePasswordHash(userId: string, passwordHash: string): void {
    this.database
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, now(), userId);
  }

  signInAllowed(identifier: string): boolean {
    const row = this.database
      .prepare('SELECT blocked_until FROM sign_in_attempts WHERE identifier = ? COLLATE NOCASE')
      .get(identifier) as Row | undefined;
    return !row || row.blocked_until === null || String(row.blocked_until) <= now();
  }

  recordSignInFailure(identifier: string): void {
    const normalized = identifier.toLowerCase();
    const timestamp = new Date();
    const row = this.database
      .prepare(
        `SELECT window_started_at, failure_count FROM sign_in_attempts
         WHERE identifier = ? COLLATE NOCASE`,
      )
      .get(normalized) as Row | undefined;
    const windowExpired =
      !row || timestamp.getTime() - Date.parse(String(row.window_started_at)) > 15 * 60 * 1000;
    const failures = windowExpired ? 1 : Number(row.failure_count) + 1;
    const windowStartedAt = windowExpired ? timestamp.toISOString() : String(row.window_started_at);
    const blockedUntil =
      failures >= 5 ? new Date(timestamp.getTime() + 15 * 60 * 1000).toISOString() : null;
    this.database
      .prepare(
        `INSERT INTO sign_in_attempts(identifier, window_started_at, failure_count, blocked_until)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(identifier) DO UPDATE SET
           window_started_at = excluded.window_started_at,
           failure_count = excluded.failure_count,
           blocked_until = excluded.blocked_until`,
      )
      .run(normalized, windowStartedAt, failures, blockedUntil);
  }

  clearSignInFailures(identifier: string): void {
    this.database
      .prepare('DELETE FROM sign_in_attempts WHERE identifier = ? COLLATE NOCASE')
      .run(identifier);
  }

  activeOrganizationForUser(userId: string): string | undefined {
    const row = this.database
      .prepare(
        `SELECT organization_id FROM memberships
         WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL
         ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1`,
      )
      .get(userId) as Row | undefined;
    return typeof row?.organization_id === 'string' ? row.organization_id : undefined;
  }

  createSession(userId: string, organizationId: string): SessionTokens {
    const sessionToken = token();
    const csrfToken = token();
    const timestamp = new Date();
    const idleExpiresAt = new Date(timestamp.getTime() + 12 * 60 * 60 * 1000).toISOString();
    const absoluteExpiresAt = new Date(
      timestamp.getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    this.database
      .prepare(
        `INSERT INTO sessions(
          id_hash, user_id, organization_id, csrf_hash, created_at, last_seen_at,
          idle_expires_at, absolute_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        this.sessionHash(sessionToken),
        userId,
        organizationId,
        hash(csrfToken),
        timestamp.toISOString(),
        timestamp.toISOString(),
        idleExpiresAt,
        absoluteExpiresAt,
      );
    const view = this.getSession(sessionToken);
    if (!view) throw new Error('New session could not be read');
    return { sessionToken, csrfToken, view };
  }

  getSession(sessionToken: string): AuthenticatedSession | undefined {
    const row = this.database
      .prepare(
        `SELECT
          u.id AS user_id, u.identifier, u.display_name, u.created_at AS user_created,
          u.updated_at AS user_updated, u.disabled_at,
          o.id AS organization_id, o.name AS organization_name, o.timezone,
          o.version AS organization_version, o.created_at AS organization_created,
          o.updated_at AS organization_updated, o.deleted_at AS organization_deleted,
          m.id AS membership_id, m.role, m.status, m.version AS membership_version,
          m.created_at AS membership_created, m.updated_at AS membership_updated,
          m.deleted_at AS membership_deleted,
          s.csrf_hash, s.idle_expires_at, s.absolute_expires_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        JOIN organizations o ON o.id = s.organization_id
        JOIN memberships m ON m.user_id = u.id AND m.organization_id = o.id
        WHERE s.id_hash IN (?, ?) AND s.revoked_at IS NULL AND m.status = 'active'
          AND u.disabled_at IS NULL AND o.deleted_at IS NULL
          AND s.idle_expires_at > ? AND s.absolute_expires_at > ?`,
      )
      .get(...this.sessionHashes(sessionToken), now(), now()) as Row | undefined;
    if (!row) return undefined;
    const organizationId = String(row.organization_id);
    const userId = String(row.user_id);
    return {
      user: {
        id: userId,
        identifier: String(row.identifier),
        displayName: String(row.display_name),
        createdAt: String(row.user_created),
        updatedAt: String(row.user_updated),
        disabledAt: row.disabled_at === null ? null : String(row.disabled_at),
      },
      organization: {
        ...entityMeta(
          organizationId,
          organizationId,
          Number(row.organization_version),
          String(row.organization_created),
          String(row.organization_updated),
          row.organization_deleted === null ? null : String(row.organization_deleted),
        ),
        name: String(row.organization_name),
        timezone: String(row.timezone),
      },
      membership: {
        ...entityMeta(
          String(row.membership_id),
          organizationId,
          Number(row.membership_version),
          String(row.membership_created),
          String(row.membership_updated),
          row.membership_deleted === null ? null : String(row.membership_deleted),
        ),
        userId,
        role: String(row.role) as Role,
        status: String(row.status) as 'active',
      },
      csrfHash: String(row.csrf_hash),
      expiresAt: String(row.absolute_expires_at),
    };
  }

  checkCsrf(session: AuthenticatedSession, csrfToken: string): boolean {
    return hash(csrfToken) === session.csrfHash;
  }

  rotateSession(sessionToken: string): SessionTokens {
    const nextSessionToken = token();
    const csrfToken = token();
    const result = this.database
      .prepare(
        `UPDATE sessions SET id_hash = ?, csrf_hash = ?, last_seen_at = ?
         WHERE id_hash IN (?, ?) AND revoked_at IS NULL`,
      )
      .run(
        this.sessionHash(nextSessionToken),
        hash(csrfToken),
        now(),
        ...this.sessionHashes(sessionToken),
      );
    if (result.changes !== 1)
      throw new StoreError('session_expired', 'The session is no longer valid');
    const view = this.getSession(nextSessionToken);
    if (!view) throw new StoreError('session_expired', 'The session is no longer valid');
    return { sessionToken: nextSessionToken, csrfToken, view };
  }

  revokeSession(sessionToken: string): void {
    this.database
      .prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash IN (?, ?)')
      .run(now(), ...this.sessionHashes(sessionToken));
  }

  listResources(organizationId: string, entityType: ResourceType): ResourceRecord[] {
    const rows = this.database
      .prepare(
        `SELECT value_json FROM resources
         WHERE organization_id = ? AND entity_type = ? AND deleted_at IS NULL
         ORDER BY updated_at DESC`,
      )
      .all(organizationId, entityType) as Row[];
    return rows.map((row) => fromJson(row.value_json));
  }

  getResource(
    organizationId: string,
    entityType: ResourceType,
    id: string,
  ): ResourceRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT value_json FROM resources
         WHERE organization_id = ? AND entity_type = ? AND id = ?`,
      )
      .get(organizationId, entityType, id) as Row | undefined;
    return row ? fromJson(row.value_json) : undefined;
  }

  patchResource(
    organizationId: string,
    entityType: ResourceType,
    id: string,
    fields: Record<string, unknown>,
  ): ResourceRecord {
    const existing = this.getResource(organizationId, entityType, id);
    if (!existing || existing.deletedAt)
      throw new StoreError('resource_not_found', 'The record was not found');
    const {
      id: _id,
      organizationId: _organizationId,
      version: _version,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      deletedAt: _deletedAt,
      ...currentFields
    } = existing;
    const parsed = resourceFieldSchemas[entityType].parse({ ...currentFields, ...fields });
    const timestamp = now();
    const value: ResourceRecord = {
      ...parsed,
      ...entityMeta(id, organizationId, existing.version + 1, existing.createdAt, timestamp, null),
    };
    const serialized = JSON.stringify(value);
    this.transaction(() => {
      this.database
        .prepare(
          `UPDATE resources SET version = ?, value_json = ?, updated_at = ?
           WHERE organization_id = ? AND entity_type = ? AND id = ?`,
        )
        .run(existing.version + 1, serialized, timestamp, organizationId, entityType, id);
      this.database
        .prepare(
          `INSERT INTO changes(
            organization_id, entity_type, entity_id, action, version, changed_at, value_json
          ) VALUES (?, ?, ?, 'upsert', ?, ?, ?)`,
        )
        .run(organizationId, entityType, id, existing.version + 1, timestamp, serialized);
    });
    return value;
  }

  applyOperation(
    organizationId: string,
    userId: string,
    operation: SyncOperation,
  ): SyncOperationResult {
    const fingerprint = hash(JSON.stringify(operation));
    const previous = this.database
      .prepare(
        `SELECT fingerprint, result_json FROM idempotency
         WHERE organization_id = ? AND user_id = ? AND operation_id = ?`,
      )
      .get(organizationId, userId, operation.operationId) as Row | undefined;
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return {
          operationId: operation.operationId,
          entityType: operation.entityType,
          entityId: operation.entityId,
          status: 'rejected',
          errorCode: 'idempotency_key_reused',
        };
      }
      const stored = JSON.parse(String(previous.result_json)) as SyncOperationResult;
      return { ...stored, status: 'duplicate' };
    }

    const result = this.transaction(() => this.applyNewOperation(organizationId, operation));
    this.database
      .prepare(
        `INSERT INTO idempotency(
          organization_id, user_id, operation_id, fingerprint, result_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        organizationId,
        userId,
        operation.operationId,
        fingerprint,
        JSON.stringify(result),
        now(),
      );
    return result;
  }

  pullChanges(organizationId: string, cursor = 0, limit = 100) {
    const boundedLimit = Math.max(1, Math.min(limit, 250));
    const rows = this.database
      .prepare(
        `SELECT sequence, entity_type, entity_id, action, version, changed_at, value_json
         FROM changes WHERE organization_id = ? AND sequence > ?
         ORDER BY sequence LIMIT ?`,
      )
      .all(organizationId, cursor, boundedLimit + 1) as Row[];
    const hasMore = rows.length > boundedLimit;
    const page = hasMore ? rows.slice(0, boundedLimit) : rows;
    const nextCursor = page.length > 0 ? Number(page.at(-1)?.sequence) : cursor;
    return {
      syncContractVersion: 1 as const,
      changes: page.map((row) => ({
        sequence: Number(row.sequence),
        entityType: String(row.entity_type) as ResourceType,
        entityId: String(row.entity_id),
        action: String(row.action) as 'upsert' | 'delete',
        version: Number(row.version),
        changedAt: String(row.changed_at),
        value: row.value_json === null ? null : (JSON.parse(String(row.value_json)) as object),
      })),
      nextCursor: String(nextCursor),
      hasMore,
      fullResyncRequired: false,
    };
  }

  private applyNewOperation(organizationId: string, operation: SyncOperation): SyncOperationResult {
    const existing = this.getResource(organizationId, operation.entityType, operation.entityId);
    const conflict = () => ({
      operationId: operation.operationId,
      entityType: operation.entityType,
      entityId: operation.entityId,
      status: 'conflict' as const,
      ...(existing ? { version: existing.version, serverValue: existing } : {}),
      ...(operation.payload ? { clientValue: operation.payload } : {}),
    });

    if (operation.action === 'create' && existing) return conflict();
    if (
      operation.action !== 'create' &&
      (!existing || existing.version !== operation.baseVersion)
    ) {
      return conflict();
    }

    const timestamp = now();
    const version = existing ? existing.version + 1 : 1;
    const createdAt = existing?.createdAt ?? timestamp;
    const deletedAt = operation.action === 'delete' ? timestamp : null;
    const parsedFields =
      operation.action === 'delete'
        ? (existing ?? {})
        : resourceFieldSchemas[operation.entityType].parse(operation.payload);
    const value: ResourceRecord = {
      ...parsedFields,
      ...entityMeta(operation.entityId, organizationId, version, createdAt, timestamp, deletedAt),
    };
    const serialized = JSON.stringify(value);

    this.database
      .prepare(
        `INSERT INTO resources(
          organization_id, entity_type, id, version, value_json, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, entity_type, id) DO UPDATE SET
          version = excluded.version, value_json = excluded.value_json,
          updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
      )
      .run(
        organizationId,
        operation.entityType,
        operation.entityId,
        version,
        serialized,
        createdAt,
        timestamp,
        deletedAt,
      );
    this.database
      .prepare(
        `INSERT INTO changes(
          organization_id, entity_type, entity_id, action, version, changed_at, value_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        organizationId,
        operation.entityType,
        operation.entityId,
        operation.action === 'delete' ? 'delete' : 'upsert',
        version,
        timestamp,
        operation.action === 'delete' ? null : serialized,
      );
    return {
      operationId: operation.operationId,
      entityType: operation.entityType,
      entityId: operation.entityId,
      status: 'accepted',
      version,
      serverValue: value,
    };
  }

  private transaction<T>(work: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private audit(
    organizationId: string | null,
    actorUserId: string | null,
    action: string,
    targetType: string | null,
    targetId: string | null,
    result: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO audit_events(
          id, organization_id, actor_user_id, action, target_type, target_id, result, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), organizationId, actorUserId, action, targetType, targetId, result, now());
  }
}

export class StoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}
