import { cp, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checksums } from './backup.mjs';

export async function restoreBackup(backupDirectory, targetDirectory) {
  const source = resolve(backupDirectory);
  const target = resolve(targetDirectory);
  const manifest = JSON.parse(await readFile(join(source, 'backup-manifest.json'), 'utf8'));
  if (manifest.product !== 'ApiaryLens' || manifest.backupFormat !== 1) {
    throw new Error('Unsupported or invalid ApiaryLens backup');
  }
  if (manifest.databaseMigration !== '0003') throw new Error('Backup migration is not compatible');
  const actual = await checksums(source, new Set(['backup-manifest.json']));
  const expected = manifest.files;
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Backup integrity verification failed');
  await requireFreshTarget(target);
  await mkdir(target, { recursive: true });
  await cp(join(source, 'apiarylens.sqlite'), join(target, 'apiarylens.sqlite'));
  try {
    if ((await stat(join(source, 'media'))).isDirectory()) {
      await cp(join(source, 'media'), join(target, 'media'), { recursive: true });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return manifest;
}

async function requireFreshTarget(target) {
  try {
    if (!(await stat(target)).isDirectory()) throw new Error('Restore target must be a directory');
    if ((await readdir(target)).length > 0) {
      throw new Error('Restore refuses to overwrite a non-empty target directory');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backup = argument('--backup');
  const target = argument('--target');
  if (!backup || !target)
    throw new Error('Usage: node scripts/restore.mjs --backup <backup> --target <empty-directory>');
  await restoreBackup(backup, target);
  console.log('Restore complete and integrity verified');
}
