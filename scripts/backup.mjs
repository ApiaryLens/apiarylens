import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite';

const productVersion = '0.1.0-preview.3';

export async function createBackup(dataDirectory, outputDirectory) {
  const data = resolve(dataDirectory);
  const output = resolve(outputDirectory);
  await requireEmptyDirectory(output);
  await mkdir(output, { recursive: true });
  const sourceDatabase = join(data, 'apiarylens.sqlite');
  const targetDatabase = join(output, 'apiarylens.sqlite');
  const database = new DatabaseSync(sourceDatabase, { readOnly: true });
  try {
    await sqliteBackup(database, targetDatabase);
  } finally {
    database.close();
  }
  const mediaSource = join(data, 'media');
  if (await exists(mediaSource)) await cp(mediaSource, join(output, 'media'), { recursive: true });

  const files = await checksums(output, new Set(['backup-manifest.json']));
  const manifest = {
    product: 'ApiaryLens',
    productVersion,
    databaseMigration: '0004',
    backupFormat: 1,
    createdAt: new Date().toISOString(),
    sourceDirectoryName: basename(data),
    files,
  };
  await writeFile(join(output, 'backup-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  return manifest;
}

async function requireEmptyDirectory(directory) {
  if (!(await exists(directory))) return;
  if (!(await stat(directory)).isDirectory()) throw new Error('Backup output must be a directory');
  if ((await readdir(directory)).length > 0)
    throw new Error('Backup output directory must be empty');
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function checksums(directory, excluded = new Set()) {
  const results = {};
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else {
        const name = relative(directory, path).replaceAll('\\', '/');
        if (!excluded.has(name)) {
          results[name] = createHash('sha256')
            .update(await readFile(path))
            .digest('hex');
        }
      }
    }
  }
  await visit(directory);
  return results;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = argument('--data');
  const output = argument('--output');
  if (!data || !output)
    throw new Error('Usage: node scripts/backup.mjs --data <data> --output <empty-directory>');
  const manifest = await createBackup(data, output);
  console.log(`Backup complete: ${Object.keys(manifest.files).length} files`);
}

export { checksums };
