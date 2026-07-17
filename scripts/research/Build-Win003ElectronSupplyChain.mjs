import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const [
  repositoryRootInput,
  labRootInput,
  serverRootInput,
  outputRootInput,
  versionsPathInput,
  packagedRootInput,
] = process.argv.slice(2);
if (!packagedRootInput) {
  throw new Error(
    'Usage: node Build-Win003ElectronSupplyChain.mjs <repository-root> <lab-root> <server-root> <output-root> <versions-json> <packaged-root>',
  );
}

const repositoryRoot = resolve(repositoryRootInput);
const labRoot = resolve(labRootInput);
const serverRoot = resolve(serverRootInput);
const outputRoot = resolve(outputRootInput);
const versionsPath = resolve(versionsPathInput);
const packagedRoot = resolve(packagedRootInput);
const runnerTemp = resolve(process.env.RUNNER_TEMP ?? '');
if (
  !runnerTemp ||
  !isWithin(outputRoot, runnerTemp) ||
  !isWithin(labRoot, runnerTemp) ||
  !isWithin(packagedRoot, labRoot)
) {
  throw new Error('WIN-003 supply-chain output and lab must remain under RUNNER_TEMP');
}

const noticesRoot = join(outputRoot, 'notices');
await mkdir(noticesRoot, { recursive: true });

const rootPackage = await readJson(join(repositoryRoot, 'package.json'));
const lock = await readJson(join(labRoot, 'package-lock.json'));
const versions = await readJson(versionsPath);
const electronPackage = await readJson(join(labRoot, 'node_modules', 'electron', 'package.json'));
const winstallerPackage = await readJson(
  join(labRoot, 'node_modules', 'electron-winstaller', 'package.json'),
);

const prohibitedLicense = /(AGPL|SSPL|BUSL|source.available|noncommercial|unlicensed)/i;
const buildComponents = [];
for (const [packagePath, value] of Object.entries(lock.packages ?? {})) {
  if (!packagePath) continue;
  const name = value.name ?? packageNameFromLockPath(packagePath);
  const version = value.version;
  const license = value.license;
  if (!name || !version || !license || prohibitedLicense.test(license)) {
    throw new Error(`Forbidden or incomplete build component: ${packagePath}`);
  }
  if (!value.resolved || !value.integrity) {
    throw new Error(`Build component lacks registry provenance: ${name}@${version}`);
  }
  buildComponents.push({
    type: 'library',
    name,
    version,
    'bom-ref': `npm-lock:${packagePath}`,
    purl: npmPurl(name, version),
    licenses: licenseValue(license),
    hashes: [integrityHash(value.integrity)],
    externalReferences: [{ type: 'distribution', url: value.resolved }],
    properties: [{ name: 'apiarylens:npm-dev', value: String(Boolean(value.dev)) }],
  });
}
buildComponents.sort(componentSort);

const noticeFiles = new Map();
await copyNotice(join(repositoryRoot, 'LICENSE'), 'APIARYLENS-LICENSE.txt');
await copyNotice(join(repositoryRoot, 'NOTICE'), 'APIARYLENS-NOTICE.txt');
await copyNotice(join(packagedRoot, 'LICENSE'), 'ELECTRON-LICENSE.txt');
const chromiumNotice = join(packagedRoot, 'LICENSES.chromium.html');
if ((await stat(chromiumNotice)).size < 100_000) {
  throw new Error('Electron Chromium third-party notice document is unexpectedly small');
}
await copyNotice(chromiumNotice, 'ELECTRON-CHROMIUM-THIRD-PARTY-NOTICES.html');
await copyNotice(
  join(labRoot, 'node_modules', 'electron-winstaller', 'LICENSE'),
  'SQUIRREL-WINDOWS-LICENSE.txt',
);

const runtimeComponents = [];
addRuntimeComponent({
  name: 'ApiaryLens',
  version: rootPackage.version,
  license: rootPackage.license,
  purl: `pkg:generic/apiarylens@${rootPackage.version}`,
  notices: ['APIARYLENS-LICENSE.txt', 'APIARYLENS-NOTICE.txt'],
});
addRuntimeComponent({
  name: 'Electron',
  version: electronPackage.version,
  license: electronPackage.license,
  purl: npmPurl('electron', electronPackage.version),
  notices: ['ELECTRON-LICENSE.txt', 'ELECTRON-CHROMIUM-THIRD-PARTY-NOTICES.html'],
});
addRuntimeComponent({
  name: 'Chromium (bundled by Electron)',
  version: versions.chrome,
  license: 'BSD-3-Clause',
  purl: `pkg:generic/chromium@${versions.chrome}`,
  notices: ['ELECTRON-CHROMIUM-THIRD-PARTY-NOTICES.html'],
});
addRuntimeComponent({
  name: 'Node.js (bundled by Electron)',
  version: versions.node,
  license: 'MIT',
  purl: `pkg:generic/nodejs@${versions.node}`,
  notices: ['ELECTRON-CHROMIUM-THIRD-PARTY-NOTICES.html'],
});
addRuntimeComponent({
  name: 'Squirrel.Windows',
  version: winstallerPackage.version,
  license: winstallerPackage.license,
  purl: npmPurl('electron-winstaller', winstallerPackage.version),
  notices: ['SQUIRREL-WINDOWS-LICENSE.txt'],
});

const serverPackages = await collectServerPackages(serverRoot);
for (const entry of serverPackages) {
  const noticeNames = [];
  if (entry.package.name.startsWith('@apiarylens/')) {
    noticeNames.push('APIARYLENS-LICENSE.txt', 'APIARYLENS-NOTICE.txt');
  } else {
    const candidates = (await readdir(entry.directory, { withFileTypes: true }))
      .filter((item) => item.isFile() && /^(license|notice|copying)(\.|$)/i.test(item.name))
      .map((item) => item.name)
      .sort();
    if (candidates.length === 0) {
      throw new Error(`Runtime package lacks a distributed license/notice: ${entry.package.name}`);
    }
    for (const candidate of candidates) {
      const safePackageName = entry.package.name.replaceAll('@', '').replaceAll('/', '-');
      const destination = `SERVER-${safePackageName}-${candidate}`;
      await copyNotice(join(entry.directory, candidate), destination);
      noticeNames.push(destination);
    }
  }
  addRuntimeComponent({
    name: entry.package.name,
    version: entry.package.version,
    license: entry.package.license,
    purl: npmPurl(entry.package.name, entry.package.version),
    notices: noticeNames,
  });
}
runtimeComponents.sort(componentSort);

const runtimeBom = makeBom(
  'ApiaryLens Windows installed runtime',
  rootPackage.version,
  runtimeComponents,
);
const buildBom = makeBom(
  'ApiaryLens Windows Electron build inputs',
  rootPackage.version,
  buildComponents,
);
const reconciliation = {
  schemaVersion: 1,
  productVersion: rootPackage.version,
  electronVersion: versions.electron,
  chromiumVersion: versions.chrome,
  nodeVersion: versions.node,
  buildComponentCount: buildComponents.length,
  buildComponentsWithDeclaredLicense: buildComponents.length,
  buildComponentsWithRegistryIntegrity: buildComponents.length,
  runtimeComponentCount: runtimeComponents.length,
  runtimeComponentsWithNoticeCoverage: runtimeComponents.length,
  notices: [...noticeFiles.entries()]
    .map(([path, sha256]) => ({ path, sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path)),
  runtimeComponents: runtimeComponents.map((component) => ({
    name: component.name,
    version: component.version,
    license: component.licenses[0].expression ?? component.licenses[0].license.id,
    notices: component.properties
      .filter((property) => property.name === 'apiarylens:notice')
      .map((property) => property.value),
  })),
};

await writeJson(join(outputRoot, 'build-inputs.cdx.json'), buildBom);
await writeJson(join(outputRoot, 'runtime.cdx.json'), runtimeBom);
await writeJson(join(outputRoot, 'notice-reconciliation.json'), reconciliation);
await writeFile(
  join(outputRoot, 'THIRD-PARTY-NOTICES.md'),
  `# ApiaryLens Windows Runtime Notices\n\n` +
    `This bundle accompanies ApiaryLens ${rootPackage.version}. It reconciles ` +
    `${runtimeComponents.length} top-level runtime components with ${noticeFiles.size} ` +
    `installed license or notice files. Electron's Chromium notice document is the ` +
    `authoritative notice collection for Chromium, Node.js, FFmpeg, and other components ` +
    `bundled in the Electron distribution.\n\n` +
    `The machine-readable mapping is in \`notice-reconciliation.json\`.\n`,
  'utf8',
);

console.log(
  JSON.stringify({
    buildComponentCount: buildComponents.length,
    runtimeComponentCount: runtimeComponents.length,
    noticeFileCount: noticeFiles.size,
  }),
);

function addRuntimeComponent({ name, version, license, purl, notices }) {
  if (!name || !version || !license || prohibitedLicense.test(license) || notices.length === 0) {
    throw new Error(`Forbidden or incomplete runtime component: ${name}@${version}`);
  }
  runtimeComponents.push({
    type: name === 'ApiaryLens' ? 'application' : 'library',
    name,
    version,
    'bom-ref': purl,
    purl,
    licenses: licenseValue(license),
    properties: notices.map((notice) => ({ name: 'apiarylens:notice', value: notice })),
  });
}

async function collectServerPackages(root) {
  const found = [];
  try {
    const packageValue = await readJson(join(root, 'package.json'));
    if (packageValue.name && packageValue.version && packageValue.license) {
      found.push({ directory: root, package: packageValue });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await walk(root);
  const selected = new Map();
  for (const entry of found.sort((a, b) => a.directory.length - b.directory.length)) {
    const key = `${entry.package.name}@${entry.package.version}`;
    if (!selected.has(key)) selected.set(key, entry);
  }
  return [...selected.values()].sort((a, b) =>
    `${a.package.name}@${a.package.version}`.localeCompare(
      `${b.package.name}@${b.package.version}`,
    ),
  );

  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      const child = join(directory, item.name);
      const packagePath = join(child, 'package.json');
      try {
        const packageValue = await readJson(packagePath);
        if (packageValue.name && packageValue.version && packageValue.license) {
          found.push({ directory: child, package: packageValue });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await walk(child);
    }
  }
}

async function copyNotice(source, destinationName) {
  const destination = join(noticesRoot, destinationName);
  await copyFile(source, destination);
  const content = await readFile(destination);
  noticeFiles.set(`notices/${destinationName}`, createHash('sha256').update(content).digest('hex'));
}

function makeBom(name, version, components) {
  const digest = createHash('sha256')
    .update(components.map((component) => component['bom-ref']).join('\n'))
    .digest('hex');
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${uuidFromHash(digest)}`,
    version: 1,
    metadata: { component: { type: 'application', name, version } },
    components,
  };
}

function packageNameFromLockPath(packagePath) {
  const tail = packagePath.split('node_modules/').at(-1);
  if (!tail) return null;
  const segments = tail.split('/');
  return segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
}

function npmPurl(name, version) {
  return `pkg:npm/${encodeURIComponent(name).replace('%40', '@')}@${version}`;
}

function licenseValue(license) {
  return license.includes(' ') ? [{ expression: license }] : [{ license: { id: license } }];
}

function integrityHash(integrity) {
  const [algorithm, encoded] = integrity.split('-', 2);
  if (algorithm !== 'sha512' || !encoded)
    throw new Error(`Unsupported npm integrity: ${integrity}`);
  return { alg: 'SHA-512', content: Buffer.from(encoded, 'base64').toString('hex') };
}

function componentSort(a, b) {
  return `${a.name}@${a.version}:${a['bom-ref']}`.localeCompare(
    `${b.name}@${b.version}:${b['bom-ref']}`,
  );
}

function uuidFromHash(hash) {
  const value = hash.slice(0, 32).split('');
  value[12] = '4';
  value[16] = ((Number.parseInt(value[16], 16) & 0x3) | 0x8).toString(16);
  return `${value.slice(0, 8).join('')}-${value.slice(8, 12).join('')}-${value.slice(12, 16).join('')}-${value.slice(16, 20).join('')}-${value.slice(20).join('')}`;
}

function isWithin(path, root) {
  const candidate = relative(root, path);
  return candidate === '' || (!candidate.startsWith(`..${sep}`) && candidate !== '..');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
