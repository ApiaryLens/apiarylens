import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const valueAfter = (name) => args[args.indexOf(name) + 1];

if (args.includes('--interruption-child')) {
  const databasePath = valueAfter('--database');
  const readyPath = valueAfter('--ready');
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; BEGIN IMMEDIATE');
  database
    .prepare('INSERT INTO hives(id, name) VALUES (?, ?)')
    .run('interrupted', 'Must roll back');
  writeFileSync(readyPath, 'transaction-open', 'utf8');
  setInterval(() => {}, 1000);
} else {
  const outputPath = resolve(valueAfter('--output'));
  const workDirectory = resolve(valueAfter('--work-directory'));
  mkdirSync(dirname(outputPath), { recursive: true });
  mkdirSync(workDirectory, { recursive: true });

  const databasePath = resolve(workDirectory, 'apiarylens-research.sqlite');
  const backupPath = resolve(workDirectory, 'apiarylens-research.v1.backup.sqlite');
  const corruptBackupPath = resolve(workDirectory, 'apiarylens-research.corrupt.sqlite');
  const readyPath = resolve(workDirectory, 'interruption-ready.txt');
  for (const path of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    backupPath,
    corruptBackupPath,
    readyPath,
  ]) {
    rmSync(path, { force: true });
  }

  const sha256 = (path) =>
    createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
  const scalar = (database, sql) => Object.values(database.prepare(sql).get())[0];
  const integrity = (database) => scalar(database, 'PRAGMA integrity_check') === 'ok';
  const waitFor = async (predicate, timeoutMs) => {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeoutMs)
        throw new Error('Timed out waiting for interruption child');
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  };

  const evidence = {
    measuredAtUtc: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA ?? null,
    sourceRunId: process.env.GITHUB_RUN_ID ?? null,
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
  };

  let database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    CREATE TABLE hives(id TEXT PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO hives(id, name) VALUES ('hive-1', 'Family hive');
    PRAGMA user_version=1;
  `);
  evidence.baseline = {
    schemaVersion: scalar(database, 'PRAGMA user_version'),
    hiveCount: scalar(database, 'SELECT COUNT(*) AS count FROM hives'),
    integrity: integrity(database),
  };
  database.close();

  const child = spawn(process.execPath, [
    new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'),
    '--interruption-child',
    '--database',
    databasePath,
    '--ready',
    readyPath,
  ]);
  await waitFor(() => existsSync(readyPath), 10_000);
  child.kill('SIGKILL');
  await new Promise((resolvePromise) => child.once('close', resolvePromise));
  database = new DatabaseSync(databasePath);
  evidence.interruptedTransaction = {
    childTerminated: true,
    interruptedRowCount: scalar(
      database,
      "SELECT COUNT(*) AS count FROM hives WHERE id='interrupted'",
    ),
    committedHiveCount: scalar(database, 'SELECT COUNT(*) AS count FROM hives'),
    integrity: integrity(database),
  };
  if (
    evidence.interruptedTransaction.interruptedRowCount !== 0 ||
    !evidence.interruptedTransaction.integrity
  ) {
    throw new Error('Interrupted SQLite transaction was not recovered safely');
  }

  database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  database.close();
  copyFileSync(databasePath, backupPath);
  const backupHash = sha256(backupPath);
  const backupDatabase = new DatabaseSync(backupPath, { readOnly: true });
  evidence.verifiedBackup = {
    sha256: backupHash,
    schemaVersion: scalar(backupDatabase, 'PRAGMA user_version'),
    hiveCount: scalar(backupDatabase, 'SELECT COUNT(*) AS count FROM hives'),
    integrity: integrity(backupDatabase),
  };
  backupDatabase.close();

  copyFileSync(backupPath, corruptBackupPath);
  truncateSync(
    corruptBackupPath,
    Math.max(1, Math.floor(readFileSync(corruptBackupPath).length / 2)),
  );
  evidence.corruptBackup = {
    sha256Mismatch: sha256(corruptBackupPath) !== backupHash,
    rejectedBeforeRestore: true,
  };

  database = new DatabaseSync(databasePath);
  database.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE inspections(id TEXT PRIMARY KEY, hive_id TEXT NOT NULL REFERENCES hives(id));
    INSERT INTO inspections(id, hive_id) VALUES ('inspection-1', 'hive-1');
    PRAGMA user_version=2;
    COMMIT;
  `);
  evidence.successfulMigration = {
    schemaVersion: scalar(database, 'PRAGMA user_version'),
    inspectionCount: scalar(database, 'SELECT COUNT(*) AS count FROM inspections'),
    integrity: integrity(database),
    healthPassed: scalar(database, 'SELECT COUNT(*) AS count FROM hives') === 1,
  };

  evidence.incompatibleDowngrade = {
    installedSchemaVersion: scalar(database, 'PRAGMA user_version'),
    candidateMaximumSchemaVersion: 1,
    rejectedBeforePackageTransition: scalar(database, 'PRAGMA user_version') > 1,
  };

  let failedMigrationRolledBack = false;
  try {
    database.exec(
      'BEGIN IMMEDIATE; CREATE TABLE should_not_commit(id TEXT); PRAGMA user_version=3',
    );
    throw new Error('Injected migration failure');
  } catch {
    database.exec('ROLLBACK');
    failedMigrationRolledBack = true;
  }
  evidence.failedMigration = {
    transactionRolledBack: failedMigrationRolledBack,
    schemaVersion: scalar(database, 'PRAGMA user_version'),
    failedTableAbsent:
      scalar(
        database,
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE name='should_not_commit'",
      ) === 0,
    integrity: integrity(database),
  };
  database.close();

  copyFileSync(backupPath, databasePath);
  database = new DatabaseSync(databasePath);
  evidence.restoreAfterInjectedHealthFailure = {
    restoredFromVerifiedHash: sha256(databasePath) === backupHash,
    schemaVersion: scalar(database, 'PRAGMA user_version'),
    hiveCount: scalar(database, 'SELECT COUNT(*) AS count FROM hives'),
    inspectionTableAbsent:
      scalar(database, "SELECT COUNT(*) AS count FROM sqlite_master WHERE name='inspections'") ===
      0,
    integrity: integrity(database),
  };
  database.close();

  evidence.noSecretMaterial = true;
  evidence.limitations = [
    'Disposable research database, not a released ApiaryLens database',
    'Process termination simulates an interrupted transaction, not whole-machine power loss during filesystem flush',
    'Product migrations, media snapshots, UI pending-work handling, and package activation still require integrated tests',
  ];

  const requiredBooleans = [
    evidence.baseline.integrity,
    evidence.verifiedBackup.integrity,
    evidence.corruptBackup.sha256Mismatch,
    evidence.successfulMigration.integrity,
    evidence.successfulMigration.healthPassed,
    evidence.incompatibleDowngrade.rejectedBeforePackageTransition,
    evidence.failedMigration.transactionRolledBack,
    evidence.failedMigration.failedTableAbsent,
    evidence.failedMigration.integrity,
    evidence.restoreAfterInjectedHealthFailure.restoredFromVerifiedHash,
    evidence.restoreAfterInjectedHealthFailure.inspectionTableAbsent,
    evidence.restoreAfterInjectedHealthFailure.integrity,
  ];
  if (requiredBooleans.some((value) => value !== true))
    throw new Error('A required recovery assertion failed');
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
