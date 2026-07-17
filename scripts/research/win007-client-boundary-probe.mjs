import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const valueAfter = (name) => args[args.indexOf(name) + 1];
const repository = resolve(valueAfter('--repository') ?? '.');
const output = resolve(valueAfter('--output'));
const browserGlobalPatterns = {
  window: /\bwindow\s*\./g,
  document: /\bdocument\s*\./g,
  navigator: /\bnavigator\s*\./g,
  location: /\blocation\s*\./g,
  history: /\bhistory\s*\./g,
  fetch: /\bfetch\s*\(/g,
  File: /\bFile\b/g,
  Blob: /\bBlob\b/g,
  ServiceWorkerRegistration: /\bServiceWorkerRegistration\b/g,
};
const nodeBuiltins = /^node:/;

async function sourceFiles(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (['.ts', '.tsx'].includes(extname(entry.name)) && !entry.name.endsWith('.test.ts')) {
        result.push(path);
      }
    }
  }
  await visit(root);
  return result.sort();
}

function analyze(path, text) {
  const imports = [
    ...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...text.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);
  const globals = Object.fromEntries(
    Object.entries(browserGlobalPatterns)
      .map(([name, pattern]) => [name, [...text.matchAll(pattern)].length])
      .filter(([, count]) => count > 0),
  );
  const functions = [...text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(
    (match) => match[1],
  );
  const components = functions.filter((name) => /^[A-Z]/.test(name));
  return {
    path: relative(repository, path).replaceAll('\\', '/'),
    lines: text.split(/\r?\n/).length,
    imports,
    browserGlobals: Object.fromEntries(Object.entries(globals).filter(([, count]) => count > 0)),
    functions,
    components,
  };
}

async function analyzeTree(path) {
  return Promise.all(
    (await sourceFiles(path)).map(async (file) => analyze(file, await readFile(file, 'utf8'))),
  );
}

async function directoryEntries(path) {
  const entries = [];
  async function visit(directory) {
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of children) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.name !== '.gitkeep') entries.push(relative(path, child).replaceAll('\\', '/'));
    }
  }
  await visit(path);
  return entries.sort();
}

const web = await analyzeTree(join(repository, 'apps', 'web', 'src'));
const contracts = await analyzeTree(join(repository, 'packages', 'contracts', 'src'));
const contractsPlatformNeutral = contracts.every(
  (file) =>
    Object.keys(file.browserGlobals).length === 0 &&
    file.imports.every((specifier) => !nodeBuiltins.test(specifier)),
);
assert.equal(contractsPlatformNeutral, true, 'contracts must remain platform-neutral');

const placeholders = {};
for (const path of ['packages/api-client', 'packages/shared', 'packages/ui', 'apps/windows']) {
  placeholders[path] = await directoryEntries(join(repository, ...path.split('/')));
}

const app = web.find((file) => file.path === 'apps/web/src/App.tsx');
const database = web.find((file) => file.path === 'apps/web/src/db.ts');
const api = web.find((file) => file.path === 'apps/web/src/api.ts');
assert.ok(app && database && api);

const evidence = {
  researchId: 'WIN-007',
  result: 'decision-ready-baseline',
  source: {
    web,
    contracts,
    placeholders,
  },
  findings: {
    contractsPlatformNeutral,
    appLines: app.lines,
    appComponentCount: app.components.length,
    appBrowserGlobals: app.browserGlobals,
    databaseLines: database.lines,
    databaseBrowserGlobals: database.browserGlobals,
    apiLines: api.lines,
    apiBrowserGlobals: api.browserGlobals,
    currentUiPackageImplemented: placeholders['packages/ui'].length > 0,
    currentSharedPackageImplemented: placeholders['packages/shared'].length > 0,
    currentApiClientPackageImplemented: placeholders['packages/api-client'].length > 0,
    currentWindowsClientImplemented: placeholders['apps/windows'].length > 0,
  },
  recommendation: {
    share: [
      'versioned contracts and domain types',
      'pure validation and domain policy',
      'transport-independent use cases',
      'repository/outbox interfaces and deterministic conflict policy',
      'accessible React feature components and design tokens where host-neutral',
    ],
    keepHostSpecific: [
      'application shell, navigation, window chrome, and deep links',
      'service-worker and browser install/update lifecycle',
      'Windows package/update/credential/notification integration',
      'IndexedDB, SQLite, filesystem, camera, picker, and keychain adapters',
      'cookie/CSRF versus native bearer/session transport',
      'iOS and Android platform presentation where conventions diverge',
    ],
    extractionOrder: [
      'pure domain/application kernel',
      'ports for session, repository, outbox, media, connectivity, update, and navigation',
      'transport clients and host adapters',
      'feature-level React components with injected ports',
      'separate PWA and Windows composition roots',
    ],
  },
  nonClaims: [
    'No shared package or Windows client was implemented by this research probe.',
    'Static dependency evidence does not replace native host, accessibility, or device UAT.',
  ],
};

await mkdir(output, { recursive: true });
await writeFile(
  join(output, 'win007-client-boundary-evidence.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence.findings, null, 2));
