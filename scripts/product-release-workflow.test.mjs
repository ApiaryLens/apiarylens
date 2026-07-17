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

  it('refuses to replace an existing immutable release', () => {
    expect(workflow).toContain('gh release view "$EXACT_TAG"');
    expect(workflow).not.toContain('--clobber');
    expect(workflow).not.toContain('gh release edit');
  });
});
