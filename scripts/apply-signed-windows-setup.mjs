// ADR 0026 (C1): re-anchor the Windows package manifest to SignPath-signed
// bytes.
//
// The release workflow builds the Squirrel package unsigned, uploads
// ApiaryLensSetup.exe to SignPath Foundation, waits for the manually approved
// signing request, and copies the signed bytes back over
// release/artifacts/windows/artifacts/ApiaryLensSetup.exe. Signing changes
// those bytes, so this script recomputes the Setup entry of
// windows-package.json (size and SHA-256) from the signed file, fail-closed
// verifies the Authenticode signature, and records the verified signer
// identity. finalize-windows-release.mjs then propagates the updated records
// into release-manifest.json and the signing evidence, which is how every
// downstream hash (SHA256SUMS, attestations, published subjects) describes
// the signed bytes — never the unsigned intermediate.
//
// Squirrel note: RELEASES indexes the .nupkg artifacts, not Setup.exe, so
// signing the Setup after packaging leaves RELEASES internally consistent and
// no other artifact record changes here.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function applySignedSetupRecord(manifest, { name, bytes, sha256, signature }) {
  const record = manifest.artifacts?.find((artifact) => artifact.name === name);
  if (!record) throw new Error(`windows-package.json does not list ${name}.`);
  if (record.sha256 === sha256)
    throw new Error(`${name} bytes are unchanged; the signing round trip did not happen.`);
  if (!signature?.publisher || !signature?.thumbprint)
    throw new Error('Signed Setup requires a verified Authenticode publisher and thumbprint.');
  record.bytes = bytes;
  record.sha256 = sha256;
  return {
    ...manifest,
    signed: true,
    signature,
    artifacts: manifest.artifacts,
  };
}

function run() {
  const root = resolve(import.meta.dirname, '..');
  const windowsRoot = join(root, 'release', 'artifacts', 'windows');
  const manifestPath = join(windowsRoot, 'windows-package.json');
  const setupName = 'ApiaryLensSetup.exe';
  const setupPath = join(windowsRoot, 'artifacts', setupName);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bytes = readFileSync(setupPath);
  // Fail closed: the returned file must carry a valid Authenticode signature
  // before any manifest hash is recomputed from it.
  const signature = JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$s=Get-AuthenticodeSignature -LiteralPath $args[0]; if ($s.Status -ne 'Valid' -or -not $s.SignerCertificate) { exit 41 }; [pscustomobject]@{publisher=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint} | ConvertTo-Json -Compress",
        setupPath,
      ],
      { encoding: 'utf8', windowsHide: true },
    ).trim(),
  );
  const updated = applySignedSetupRecord(manifest, {
    name: setupName,
    bytes: statSync(setupPath).size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    signature,
  });
  writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
  const record = updated.artifacts.find((artifact) => artifact.name === setupName);
  console.log(
    `Re-anchored ${setupName} to signed bytes: sha256=${record.sha256}, publisher=${signature.publisher}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
