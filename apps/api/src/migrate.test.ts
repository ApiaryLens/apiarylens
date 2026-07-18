import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';

let root: string;
let databasePath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'apiarylens-migrate-'));
  databasePath = join(root, 'data', 'apiarylens.sqlite');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function tamper(mutate: (database: DatabaseSync) => void): void {
  const database = new DatabaseSync(databasePath);
  try {
    mutate(database);
  } finally {
    database.close();
  }
}

describe('one-shot migration entrypoint', () => {
  it('applies every embedded migration to a fresh database and reports the ledger', () => {
    const report = runMigrations(databasePath);
    expect(report.status).toBe('applied');
    if (report.status !== 'applied') return;
    expect(report.migrationHead).toBe('0004');
    expect(report.ledger.map(({ version }) => version)).toEqual(['0001', '0002', '0003', '0004']);
    for (const entry of report.ledger) {
      expect(entry.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('is idempotent: a second run reports the same head without reapplying', () => {
    const first = runMigrations(databasePath);
    const second = runMigrations(databasePath);
    expect(first.status).toBe('applied');
    expect(second.status).toBe('applied');
    if (first.status !== 'applied' || second.status !== 'applied') return;
    expect(second.ledger).toEqual(first.ledger);
  });

  it('rejects a checksum mismatch recorded in the ledger', () => {
    expect(runMigrations(databasePath).status).toBe('applied');
    tamper((database) =>
      database
        .prepare('UPDATE migrations SET checksum = ? WHERE version = ?')
        .run('0'.repeat(64), '0002'),
    );
    const report = runMigrations(databasePath);
    expect(report).toMatchObject({ status: 'failed', code: 'migration_checksum_mismatch' });
  });

  it('rejects an unknown-ahead migration version', () => {
    expect(runMigrations(databasePath).status).toBe('applied');
    tamper((database) =>
      database
        .prepare('INSERT INTO migrations(version, applied_at, checksum) VALUES (?, ?, ?)')
        .run('0099', new Date().toISOString(), 'f'.repeat(64)),
    );
    const report = runMigrations(databasePath);
    expect(report).toMatchObject({ status: 'failed', code: 'migration_ledger_invalid' });
    if (report.status === 'failed') expect(report.message).toContain('unknown version 0099');
  });

  it('rejects a skipped or out-of-order ledger', () => {
    expect(runMigrations(databasePath).status).toBe('applied');
    tamper((database) => database.prepare('DELETE FROM migrations WHERE version = ?').run('0002'));
    const report = runMigrations(databasePath);
    expect(report).toMatchObject({ status: 'failed', code: 'migration_ledger_invalid' });
    if (report.status === 'failed') expect(report.message).toContain('skipped or out of order');
  });

  it('rejects a reordered ledger', () => {
    expect(runMigrations(databasePath).status).toBe('applied');
    tamper((database) => {
      database.exec(`
        UPDATE migrations SET version = '00xx' WHERE version = '0003';
        UPDATE migrations SET version = '0003' WHERE version = '0004';
        UPDATE migrations SET version = '0004' WHERE version = '00xx';
      `);
    });
    const report = runMigrations(databasePath);
    expect(report).toMatchObject({ status: 'failed', code: 'migration_ledger_invalid' });
    if (report.status === 'failed') expect(report.message).toContain('skipped or out of order');
  });
});
