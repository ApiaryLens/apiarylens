import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SqliteStore, StoreError } from '@apiarylens/database';

export interface MigrationLedgerEntry {
  version: string;
  appliedAt: string;
  checksum: string;
}

export type MigrationReport =
  | {
      status: 'applied';
      database: string;
      migrationHead: string;
      ledger: MigrationLedgerEntry[];
    }
  | {
      status: 'failed';
      database: string;
      code: string;
      message: string;
    };

// Dedicated, observable migration step for the Compose/air-gap lifecycle
// (versioning-release-and-update-lifecycle.md, Compose path step 4). Opening
// the store applies and validates every embedded migration transactionally;
// this entrypoint makes that implicit boot behavior a one-shot, JSON-reporting
// pre-activation gate that update scripts run in a `--network none` container
// before any service is recreated.
export function runMigrations(databasePath: string): MigrationReport {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  let store: SqliteStore;
  try {
    store = new SqliteStore(databasePath);
  } catch (error) {
    return {
      status: 'failed',
      database: databasePath,
      code: error instanceof StoreError ? error.code : 'migration_error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    const rows = store.database
      .prepare('SELECT version, applied_at, checksum FROM migrations ORDER BY rowid')
      .all() as { version: string; applied_at: string; checksum: string }[];
    const ledger = rows.map(({ version, applied_at: appliedAt, checksum }) => ({
      version,
      appliedAt,
      checksum,
    }));
    const head = ledger.at(-1);
    if (!head) {
      return {
        status: 'failed',
        database: databasePath,
        code: 'migration_ledger_invalid',
        message: 'The migration ledger is empty after migration',
      };
    }
    return { status: 'applied', database: databasePath, migrationHead: head.version, ledger };
  } finally {
    store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databasePath = process.env.APIARYLENS_DATABASE;
  if (!databasePath) {
    console.error('APIARYLENS_DATABASE must name the SQLite database to migrate');
    process.exit(64);
  }
  const report = runMigrations(databasePath);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'applied' ? 0 : 1);
}
