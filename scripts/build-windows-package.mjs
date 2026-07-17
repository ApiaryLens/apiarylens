import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requireFromWindows = createRequire(join(root, 'apps', 'windows', 'package.json'));
const electronPackager = requireFromWindows('@electron/packager');
const { createWindowsInstaller } = requireFromWindows('electron-winstaller');
const pnpmCli = process.env.npm_execpath;
const output = resolve(process.argv[2] ?? join(root, '.artifacts', 'windows-release'));
const allowedRoots = [resolve(root, '.artifacts'), resolve(root, 'release', 'artifacts')];
if (!allowedRoots.some((allowed) => output === allowed || output.startsWith(`${allowed}${sep}`))) {
  throw new Error('Windows package output must stay under .artifacts or release/artifacts');
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true, mode: 0o700 });
const staging = join(output, 'staging');
const app = join(staging, 'app');
const legal = join(staging, 'legal');
const web = join(staging, 'web');
const icon = join(staging, 'apiarylens.ico');
const packaged = join(output, 'packaged');
const make = join(output, 'make');

const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
const runPnpm = (args, options = {}) => {
  if (pnpmCli) return run(process.execPath, [pnpmCli, ...args], options);
  if (process.platform === 'win32') {
    return run('cmd.exe', ['/d', '/s', '/c', 'corepack', 'pnpm', ...args], options);
  }
  return run('corepack', ['pnpm', ...args], options);
};

runPnpm(['--filter', '@apiarylens/windows', 'run', 'clean']);
runPnpm(['--filter', '@apiarylens/windows', 'run', 'build']);
runPnpm([
  '--config.node-linker=hoisted',
  '--filter',
  '@apiarylens/windows',
  'deploy',
  '--legacy',
  '--prod',
  app,
]);

const stagedPackagePath = join(app, 'package.json');
const stagedPackage = JSON.parse(readFileSync(stagedPackagePath, 'utf8'));
writeFileSync(
  stagedPackagePath,
  `${JSON.stringify({ ...stagedPackage, name: 'apiarylens', productName: 'ApiaryLens' }, null, 2)}\n`,
);

for (const disposable of ['apps', 'src', 'tsconfig.json', 'tsconfig.build.json']) {
  rmSync(join(app, disposable), { recursive: true, force: true });
}
mkdirSync(legal, { recursive: true });
cpSync(join(root, 'apps', 'web', 'dist'), join(web, 'dist'), { recursive: true });
for (const source of [
  'LICENSE',
  'NOTICE',
  'release/apiarylens-license-report.md',
  'release/apiarylens-sbom.cdx.json',
  'release/apiarylens-provenance.intoto.jsonl',
]) {
  const absolute = join(root, source);
  if (!existsSync(absolute)) throw new Error(`Missing Windows legal/release input ${source}`);
  copyFileSync(absolute, join(legal, source.replaceAll('/', '-')));
}

const png = readFileSync(join(root, 'assets', 'brand', 'apiarylens-mark-180.png'));
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt8(180, 6);
icoHeader.writeUInt8(180, 7);
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(png.length, 14);
icoHeader.writeUInt32LE(22, 18);
writeFileSync(icon, Buffer.concat([icoHeader, png]));

const certificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
const certificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;
const packagedPaths = await electronPackager({
  dir: app,
  out: packaged,
  platform: 'win32',
  arch: 'x64',
  electronVersion: '43.1.1',
  overwrite: true,
  asar: true,
  prune: false,
  derefSymlinks: true,
  executableName: 'ApiaryLens',
  icon,
  extraResource: [web, legal],
  ...(certificateFile ? { windowsSign: { certificateFile, certificatePassword } } : {}),
});
if (packagedPaths.length !== 1) {
  throw new Error(`Expected one packaged Windows application, received ${packagedPaths.length}`);
}
mkdirSync(make, { recursive: true });
await createWindowsInstaller({
  appDirectory: packagedPaths[0],
  outputDirectory: make,
  name: 'ApiaryLens',
  title: 'ApiaryLens',
  exe: 'ApiaryLens.exe',
  setupExe: 'ApiaryLensSetup.exe',
  setupIcon: icon,
  iconUrl: 'https://apiarylens.org/favicon.ico',
  noMsi: true,
  authors: 'ApiaryLens contributors',
  description: 'Open-source Windows apiary and hive management',
  ...(certificateFile ? { certificateFile, certificatePassword } : {}),
});

const artifactNames = readdirSync(make).filter(
  (name) => name === 'RELEASES' || name.endsWith('.exe') || name.endsWith('.nupkg'),
);
if (
  !artifactNames.some((name) => name === 'ApiaryLensSetup.exe') ||
  !artifactNames.includes('RELEASES')
) {
  throw new Error('Squirrel did not produce the required setup and update metadata');
}
const artifacts = join(output, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const records = artifactNames.sort().map((name) => {
  const source = join(make, name);
  const destination = join(artifacts, name);
  copyFileSync(source, destination);
  const bytes = readFileSync(destination);
  return {
    name,
    bytes: statSync(destination).size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
});
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const signature = certificateFile
  ? JSON.parse(
      execFileSync(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$s=Get-AuthenticodeSignature -LiteralPath $args[0]; if ($s.Status -ne 'Valid' -or -not $s.SignerCertificate) { exit 41 }; [pscustomobject]@{publisher=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint} | ConvertTo-Json -Compress",
          join(artifacts, 'ApiaryLensSetup.exe'),
        ],
        { encoding: 'utf8', windowsHide: true },
      ).trim(),
    )
  : undefined;
const manifest = {
  schemaVersion: 1,
  product: 'ApiaryLens for Windows',
  productVersion: JSON.parse(readFileSync(join(root, 'apps', 'windows', 'package.json'), 'utf8'))
    .version,
  architecture: 'x64',
  packageKind: 'squirrel-current-user',
  sourceCommit,
  signed: Boolean(process.env.WINDOWS_CERTIFICATE_FILE),
  ...(signature ? { signature } : {}),
  createdAt: new Date().toISOString(),
  artifacts: records,
};
writeFileSync(join(output, 'windows-package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(staging, { recursive: true, force: true });
console.log(`Built ${records.length} Windows package artifacts in ${relative(root, artifacts)}`);
