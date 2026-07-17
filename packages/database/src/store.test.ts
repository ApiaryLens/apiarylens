import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_MIGRATION_HEAD, type SyncOperation } from '@apiarylens/contracts';
import { SqliteStore } from './store.js';

describe('SqliteStore', () => {
  let store: SqliteStore;

  beforeEach(() => {
    store = new SqliteStore();
  });

  afterEach(() => {
    store.close();
  });

  function bootstrap(identifier = 'owner@example.test') {
    return store.bootstrap({
      identifier,
      displayName: 'Apiary Owner',
      passwordHash: 'test-only-password-hash',
      organizationName: 'Turner Apiary',
      timezone: 'America/New_York',
    });
  }

  function createApiary(organizationId: string): SyncOperation {
    return {
      operationId: randomUUID(),
      clientId: randomUUID(),
      entityType: 'apiary',
      entityId: randomUUID(),
      action: 'create',
      baseVersion: 0,
      payload: { name: 'Back field' },
      queuedAt: new Date().toISOString(),
    };
  }

  it('applies the complete ordered migration history through the release head', () => {
    const migrations = store.database
      .prepare('SELECT version FROM migrations ORDER BY version')
      .all() as Array<{ version: string }>;
    expect(migrations.map(({ version }) => version)).toEqual(['0001', '0002', '0003', '0004']);
    expect(migrations.at(-1)?.version).toBe(DATABASE_MIGRATION_HEAD);
    expect(
      store.database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'audit_events_by_organization_created_at'",
        )
        .get(),
    ).toBeDefined();
    expect(
      store.database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bootstrap_claims'",
        )
        .get(),
    ).toBeDefined();
  });

  it('permits first-owner bootstrap exactly once', () => {
    const session = bootstrap();
    expect(session.view.membership.role).toBe('owner');
    expect(() => bootstrap('second@example.test')).toThrow(/already exists/i);
  });

  it('stores keyed session identifiers while accepting a legacy hash during upgrade', () => {
    const session = bootstrap();
    const legacy = createHash('sha256').update(session.sessionToken).digest('hex');
    const stored = store.database.prepare('SELECT id_hash FROM sessions').get() as {
      id_hash: string;
    };
    expect(stored.id_hash).not.toBe(legacy);
    expect(store.getSession(session.sessionToken)?.user.identifier).toBe('owner@example.test');
    store.database.prepare('UPDATE sessions SET id_hash = ?').run(legacy);
    expect(store.getSession(session.sessionToken)?.user.identifier).toBe('owner@example.test');
  });

  it('applies and deduplicates a client operation', () => {
    const session = bootstrap();
    const operation = createApiary(session.view.organization.id);
    const first = store.applyOperation(
      session.view.organization.id,
      session.view.user.id,
      operation,
    );
    const repeated = store.applyOperation(
      session.view.organization.id,
      session.view.user.id,
      operation,
    );

    expect(first.status).toBe('accepted');
    expect(repeated.status).toBe('duplicate');
    expect(store.listResources(session.view.organization.id, 'apiary')).toHaveLength(1);
    expect(store.pullChanges(session.view.organization.id).changes).toHaveLength(1);
  });

  it('rejects an update based on a stale version', () => {
    const session = bootstrap();
    const create = createApiary(session.view.organization.id);
    store.applyOperation(session.view.organization.id, session.view.user.id, create);
    const update: SyncOperation = {
      ...create,
      operationId: randomUUID(),
      action: 'update',
      baseVersion: 0,
      payload: { name: 'Changed name' },
    };

    expect(
      store.applyOperation(session.view.organization.id, session.view.user.id, update).status,
    ).toBe('conflict');
  });

  it('never returns records from another organization', () => {
    const first = bootstrap();
    const operation = createApiary(first.view.organization.id);
    store.applyOperation(first.view.organization.id, first.view.user.id, operation);

    expect(store.listResources(randomUUID(), 'apiary')).toEqual([]);
    expect(store.getResource(randomUUID(), 'apiary', operation.entityId)).toBeUndefined();
  });

  it('temporarily throttles repeated sign-in failures without revealing account existence', () => {
    expect(store.signInAllowed('owner@example.test')).toBe(true);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      store.recordSignInFailure('owner@example.test');
    }
    expect(store.signInAllowed('OWNER@example.test')).toBe(false);
    store.clearSignInFailures('owner@example.test');
    expect(store.signInAllowed('owner@example.test')).toBe(true);
  });
});

describe('SqliteStore migration ledger', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function createDatabase(): string {
    const directory = mkdtempSync(join(tmpdir(), 'apiarylens-migrations-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'apiarylens.db');
    new SqliteStore(path).close();
    return path;
  }

  function editDatabase(path: string, edit: (database: DatabaseSync) => void): void {
    const database = new DatabaseSync(path);
    try {
      edit(database);
    } finally {
      database.close();
    }
  }

  function resetToMigration0003(database: DatabaseSync): void {
    database.exec(`
      DELETE FROM migrations WHERE version = '0004';
      DROP TABLE bootstrap_claims;
    `);
  }

  function expectHeadWasNotApplied(path: string): void {
    editDatabase(path, (database) => {
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bootstrap_claims'",
          )
          .get(),
      ).toBeUndefined();
      expect(
        database.prepare("SELECT 1 AS present FROM migrations WHERE version = '0004'").get(),
      ).toBeUndefined();
    });
  }

  it('upgrades a valid immutable migration prefix to the release head', () => {
    const path = createDatabase();
    editDatabase(path, resetToMigration0003);

    const upgraded = new SqliteStore(path);
    const versions = upgraded.database
      .prepare('SELECT version FROM migrations ORDER BY rowid')
      .all() as Array<{ version: string }>;
    expect(versions.map(({ version }) => version)).toEqual(['0001', '0002', '0003', '0004']);
    expect(
      upgraded.database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bootstrap_claims'",
        )
        .get(),
    ).toBeDefined();
    upgraded.close();
  });

  it('rejects a checksum-mismatched prefix before applying pending migrations', () => {
    const path = createDatabase();
    editDatabase(path, (database) => {
      resetToMigration0003(database);
      database.prepare("UPDATE migrations SET checksum = 'tampered' WHERE version = '0003'").run();
    });

    expect(() => new SqliteStore(path)).toThrow(/checksum.*0003|0003.*checksum/i);
    expectHeadWasNotApplied(path);
  });

  it('rejects an unknown ledger entry before applying pending migrations', () => {
    const path = createDatabase();
    editDatabase(path, (database) => {
      resetToMigration0003(database);
      database
        .prepare(
          "INSERT INTO migrations(version, applied_at, checksum) VALUES ('9999', ?, 'unknown')",
        )
        .run(new Date().toISOString());
    });

    expect(() => new SqliteStore(path)).toThrow(/unknown version 9999/i);
    expectHeadWasNotApplied(path);
  });

  it('rejects a skipped migration ledger', () => {
    const path = createDatabase();
    editDatabase(path, (database) => {
      database.prepare("DELETE FROM migrations WHERE version = '0002'").run();
    });

    expect(() => new SqliteStore(path)).toThrow(/expected 0002 but found 0003/i);
  });

  it('rejects an out-of-order migration ledger', () => {
    const path = createDatabase();
    editDatabase(path, (database) => {
      const row = database
        .prepare("SELECT applied_at, checksum FROM migrations WHERE version = '0002'")
        .get() as { applied_at: string; checksum: string };
      database.prepare("DELETE FROM migrations WHERE version = '0002'").run();
      database
        .prepare('INSERT INTO migrations(version, applied_at, checksum) VALUES (?, ?, ?)')
        .run('0002', row.applied_at, row.checksum);
    });

    expect(() => new SqliteStore(path)).toThrow(/expected 0002 but found 0003/i);
  });

  it('rolls back migration SQL when its ledger insertion fails', () => {
    const path = createDatabase();
    editDatabase(path, (database) => {
      resetToMigration0003(database);
      database.exec(`
        CREATE TRIGGER reject_migration_0004
        BEFORE INSERT ON migrations
        WHEN NEW.version = '0004'
        BEGIN
          SELECT RAISE(ABORT, 'injected ledger failure');
        END;
      `);
    });

    expect(() => new SqliteStore(path)).toThrow(/injected ledger failure/i);
    expectHeadWasNotApplied(path);
  });
});
