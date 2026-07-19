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

// The example environment ships verbatim inside the compose and air-gap
// bundles, so a stale version there confuses operators copying it to .env
// (issue #83: preview.4 shipped with 0.1.0-rc.4).
const exampleEnv = await readFile(new URL('../docker/.env.example', import.meta.url), 'utf8');
for (const expected of [
  `APIARYLENS_VERSION=${packageJson.version}`,
  `APIARYLENS_ARTIFACT_IDENTITY=ApiaryLens@${packageJson.version}+development`,
]) {
  if (!exampleEnv.includes(expected)) {
    throw new Error(`docker/.env.example is stale: expected ${expected}`);
  }
}

console.log(`Release identity valid: ${manifest.product} ${manifest.productVersion}`);
