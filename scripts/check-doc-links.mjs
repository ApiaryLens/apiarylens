import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const documents = [];
await walk(resolve(root, 'docs'));
for (const name of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'])
  documents.push(resolve(root, name));

const failures = [];
for (const file of documents) {
  const markdown = await readFile(file, 'utf8');
  for (const match of markdown.matchAll(/!?(?:\[[^\]]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (
      !target ||
      target.startsWith('#') ||
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('mailto:')
    )
      continue;
    const path = resolve(dirname(file), decodeURIComponent(target.split('#')[0]));
    try {
      await access(path);
    } catch {
      failures.push(`${file.slice(root.length + 1)} -> ${target}`);
    }
  }
}
if (failures.length) throw new Error(`Broken documentation links:\n${failures.join('\n')}`);
console.log(`Documentation links valid across ${documents.length} Markdown files.`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (['00-handoff', 'source-documents'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (extname(entry.name).toLowerCase() === '.md') documents.push(path);
  }
}
