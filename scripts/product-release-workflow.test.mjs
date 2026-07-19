import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/release-signing.yml', 'utf8');

describe('product release workflow wiring', () => {
  it('requires an exact existing tag and explicit per-run unsigned Preview input', () => {
    expect(workflow).toContain('exact_tag:');
    expect(workflow).toContain('allow_unsigned_preview:');
    expect(workflow).toContain('required: true');
    expect(workflow).toContain('default: false');
    expect(workflow).toContain('git rev-list -n 1');
    expect(workflow).toContain('node scripts/product-release-policy.mjs');
  });

  it('labels unsigned Preview Setup and records signing evidence', () => {
    expect(workflow).toContain("RELEASE_SIGNING_MODE -eq 'signed'");
    expect(workflow).toContain('APIARYLENS_WINDOWS_SIGNING_MODE');
    expect(workflow).toContain('node scripts/finalize-windows-release.mjs');
    expect(workflow).toContain('ApiaryLensSetup-UNSIGNED-PREVIEW.exe');
    expect(workflow).toContain('apiarylens-windows-signing.json');
  });

  it('bakes the UNSIGNED-PREVIEW label into the packaged app UI (Design v2 4.3a)', () => {
    // The package build step must receive the resolved signing mode so
    // scripts/build-windows-package.mjs can bake the UI label; the finalize
    // step reuses the same variable for the filename and evidence record.
    const occurrences =
      workflow.match(
        /APIARYLENS_WINDOWS_SIGNING_MODE: \$\{\{ needs\.policy\.outputs\.signing_mode \}\}/g,
      ) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    expect(workflow.indexOf('APIARYLENS_WINDOWS_SIGNING_MODE')).toBeLessThan(
      workflow.indexOf('pnpm release:windows'),
    );
  });

  it('states the SmartScreen prompt honestly without calling bypass safe (Design v2 4.3d)', () => {
    expect(workflow).toContain('SmartScreen');
    expect(workflow).toContain('not safe on trust alone');
    expect(workflow).toContain('If you have not verified the file, do not bypass');
    expect(workflow).not.toMatch(/safe to (bypass|ignore|click through)/i);
  });

  it('signs stable Setup bytes through SignPath and rehashes manifests after signing', () => {
    expect(workflow).toContain('signpath/github-action-submit-signing-request');
    expect(workflow).toContain('SIGNPATH_API_TOKEN');
    expect(workflow).toContain('SIGNPATH_ORGANIZATION_ID');
    expect(workflow).toContain('wait-for-completion: true');
    expect(workflow).toContain('node scripts/apply-signed-windows-setup.mjs');
    expect(workflow).not.toContain('WINDOWS_CERTIFICATE_PFX_BASE64');
    // The signed round trip must finish before manifests are finalized so the
    // published hashes describe signed bytes.
    expect(workflow.indexOf('apply-signed-windows-setup.mjs')).toBeLessThan(
      workflow.indexOf('node scripts/finalize-windows-release.mjs'),
    );
  });

  it('keeps package-manager submission jobs hard-disabled until GV4', () => {
    expect(workflow).toContain('winget-submission:');
    expect(workflow).toContain('chocolatey-submission:');
    expect(workflow).toContain('GV4 gate:');
    const disabledGates = workflow.match(/if: \$\{\{ false \}\}/g) ?? [];
    expect(disabledGates.length).toBeGreaterThanOrEqual(2);
    expect(workflow).toContain('komac update ApiaryLens.ApiaryLens');
    expect(workflow).toContain('choco push');
    expect(workflow).not.toContain('wingetcreate');
  });

  it('builds, attests, publishes, downloads, and verifies every subject', () => {
    for (const expected of [
      'pnpm release:artifacts',
      'pnpm release:supply-chain',
      'pnpm release:windows',
      'subject-path: dist/publish/*',
      'release-manifest.json',
      'windows-package.json',
      'SHA256SUMS',
      'gh release create',
      'gh release download',
      'gh attestation verify',
    ]) {
      expect(workflow).toContain(expected);
    }
  });

  it('publishes without the windows job only for an explicitly windows-excluded Preview', () => {
    // Owner directive 2026-07-18 (plan v2.1): the Windows client is deferred
    // pending a full rewrite, so a Preview run may exclude the Windows job via
    // the explicit include_windows=false dispatch input. The exclusion must be
    // fail-closed on both sides: a skipped windows job is acceptable only when
    // the policy resolved the exclusion, and an excluded run must refuse to
    // publish any Windows subject or stale signing evidence.
    expect(workflow).toContain('include_windows:');
    expect(workflow).toContain('APIARYLENS_INCLUDE_WINDOWS');
    expect(workflow).toContain(
      "github.event_name != 'workflow_dispatch' || inputs.include_windows",
    );
    expect(workflow).toContain("if: needs.policy.outputs.windows_included == 'true'");
    expect(workflow).toContain(
      "needs.windows.result == 'skipped' && needs.policy.outputs.windows_included == 'false'",
    );
    expect(workflow).toContain('Windows subjects present in a windows-excluded run.');
    expect(workflow).toContain('No Windows build in this release');
    expect(workflow).toContain('deferred pending a full rewrite');
  });

  it('refuses to replace an existing immutable release', () => {
    expect(workflow).toContain('gh release view "$EXACT_TAG"');
    expect(workflow).not.toContain('--clobber');
    expect(workflow).not.toContain('gh release edit');
  });

  it('proves recorded air-gap image IDs are load-reproducible before publishing (issue 82)', () => {
    // The build daemon's image store can report IDs that `docker save` does
    // not preserve; the packed bundle must be checked against its own archive
    // bytes before any subject is staged or published.
    const check = workflow.indexOf('node scripts/verify-airgap-images.mjs');
    expect(check).toBeGreaterThan(workflow.indexOf('pnpm release:airgap'));
    expect(check).toBeLessThan(workflow.indexOf('pnpm release:supply-chain'));
  });

  it('generates the compatibility manifest only after every artifact list mutation', () => {
    // Supply-chain assembly appends SBOM, license, and provenance entries to
    // the release manifest; a compatibility manifest generated earlier would
    // leave them unbound and fail release:verify before staging.
    const buildOrder = [
      'pnpm release:artifacts',
      'pnpm release:airgap',
      'pnpm release:supply-chain',
      'pnpm release:compatibility',
      'pnpm release:verify',
    ].map((command) => workflow.indexOf(command));
    expect(buildOrder.every((index) => index >= 0)).toBe(true);
    expect([...buildOrder].sort((a, b) => a - b)).toEqual(buildOrder);
    // The Windows job mutates the manifest again (windows artifacts), so it
    // must regenerate the compatibility manifest before its own verify.
    const finalize = workflow.indexOf('node scripts/finalize-windows-release.mjs');
    const windowsRegenerate = workflow.indexOf('pnpm release:compatibility', finalize);
    const windowsVerify = workflow.indexOf('pnpm release:verify', finalize);
    expect(finalize).toBeGreaterThan(-1);
    expect(windowsRegenerate).toBeGreaterThan(finalize);
    expect(windowsVerify).toBeGreaterThan(windowsRegenerate);
  });
});
