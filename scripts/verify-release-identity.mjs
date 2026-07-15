import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(
  await readFile(new URL('../release/release-manifest.json', import.meta.url), 'utf8'),
);

if (packageJson.version !== manifest.productVersion) {
  throw new Error(
    `Version mismatch: package.json=${packageJson.version}, manifest=${manifest.productVersion}`,
  );
}

console.log(`Release identity valid: ${manifest.product} ${manifest.productVersion}`);
