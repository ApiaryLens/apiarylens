import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createBackup } from './backup.mjs';
import { restoreBackup } from './restore.mjs';

const root = await mkdtemp(join(tmpdir(), 'apiarylens-backup-test-'));
try {
  const data = join(root, 'data');
  const backup = join(root, 'backup');
  const restored = join(root, 'restored');
  await mkdir(join(data, 'media', 'organization'), { recursive: true });
  const database = new DatabaseSync(join(data, 'apiarylens.sqlite'));
  database.exec('CREATE TABLE proof(id TEXT PRIMARY KEY);');
  database.prepare('INSERT INTO proof(id) VALUES (?)').run(randomUUID());
  database.close();
  await writeFile(join(data, 'media', 'organization', 'image'), new Uint8Array([1, 2, 3]));

  await createBackup(data, backup);
  await restoreBackup(backup, restored);
  const restoredDatabase = new DatabaseSync(join(restored, 'apiarylens.sqlite'), {
    readOnly: true,
  });
  assert.equal(restoredDatabase.prepare('SELECT count(*) AS count FROM proof').get().count, 1);
  restoredDatabase.close();
  assert.deepEqual(
    await readFile(join(restored, 'media', 'organization', 'image')),
    Buffer.from([1, 2, 3]),
  );

  await assert.rejects(() => restoreBackup(backup, restored), /refuses to overwrite/);
  console.log('Backup/restore verification passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
