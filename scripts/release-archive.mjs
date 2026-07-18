import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function readTreeText(source, include) {
  let text = '';
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const path = join(source, entry.name);
    if (entry.isDirectory()) text += await readTreeText(path, include);
    else if (entry.isFile() && include(path)) text += await readFile(path, 'utf8');
  }
  return text;
}

export async function addTree(files, source, prefix, include = () => true) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const path = join(source, entry.name);
    if (!include(path)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Release bundles refuse symbolic link: ${path}`);
    if (entry.isDirectory()) await addTree(files, path, `${prefix}/${entry.name}`, include);
    else if (entry.isFile())
      files.set(`${prefix}/${entry.name}`.replaceAll('\\', '/'), await readFile(path));
  }
}

export function createTar(files) {
  const chunks = [];
  for (const [name, member] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const content = Buffer.isBuffer(member) ? member : member.content;
    const mode = Buffer.isBuffer(member) ? 0o644 : (member.mode ?? 0o644);
    if (Buffer.byteLength(name) > 100) throw new Error(`Tar path is too long: ${name}`);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    octal(header, 100, 8, mode);
    octal(header, 108, 8, 0);
    octal(header, 116, 8, 0);
    octal(header, 124, 12, content.length);
    octal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    header.write('apiarylens', 265, 10, 'ascii');
    header.write('apiarylens', 297, 10, 'ascii');
    const checksum = header.reduce((sum, value) => sum + value, 0);
    const checksumText = checksum.toString(8).padStart(6, '0');
    header.write(checksumText, 148, 6, 'ascii');
    header[154] = 0;
    header[155] = 0x20;
    chunks.push(header, content);
    const remainder = content.length % 512;
    if (remainder) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function octal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0');
  buffer.write(text, offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}
