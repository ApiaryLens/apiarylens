import { mkdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

export type WindowsDataPaths = {
  root: string;
  database: string;
  media: string;
  runtime: string;
  readiness: string;
  protectedSecrets: string;
  logs: string;
  backups: string;
  migration: string;
  migrationJournal: string;
  updates: string;
  updateLedger: string;
  installSourceMarker: string;
};

export function createWindowsDataPaths(userDataPath: string): WindowsDataPaths {
  if (!isAbsolute(userDataPath)) throw new Error('Windows user-data path must be absolute');
  const requestedRoot = resolve(userDataPath, 'standalone');
  mkdirSync(requestedRoot, { recursive: true, mode: 0o700 });
  const root = realpathSync.native(requestedRoot);
  const paths = {
    root,
    database: join(root, 'data', 'apiarylens.sqlite'),
    media: join(root, 'data', 'media'),
    runtime: join(root, 'runtime'),
    readiness: join(root, 'runtime', 'service-ready.json'),
    protectedSecrets: join(root, 'credentials', 'standalone.v1.bin'),
    logs: join(root, 'logs'),
    backups: join(root, 'backups'),
    migration: join(root, 'migration'),
    migrationJournal: join(root, 'migration', 'standalone-to-connected.v1.sqlite'),
    updates: join(root, 'updates'),
    updateLedger: join(root, 'updates', 'update-ledger.v1.jsonl'),
    installSourceMarker: join(root, 'updates', 'install-source.v1.json'),
  } satisfies WindowsDataPaths;

  for (const directory of [
    root,
    join(root, 'data'),
    paths.media,
    paths.runtime,
    join(root, 'credentials'),
    paths.logs,
    paths.backups,
    paths.migration,
    paths.updates,
  ]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  for (const path of Object.values(paths)) {
    const candidate = resolve(path);
    const child = relative(root, candidate);
    if (child === '..' || child.startsWith(`..\\`) || child.startsWith('../')) {
      throw new Error('A Windows data path escaped the per-user root');
    }
  }
  return paths;
}
