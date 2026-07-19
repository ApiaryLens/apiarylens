import { describe, expect, it } from 'vitest';
import { resolveProductReleasePolicy } from './product-release-policy.mjs';
import {
  createWindowsProductArtifacts,
  createWindowsSigningEvidence,
} from './finalize-windows-release.mjs';

describe('product release signing policy', () => {
  it('permits unsigned bytes only for an explicitly opted-in exact Preview tag', () => {
    expect(
      resolveProductReleasePolicy({
        version: '0.1.0-preview.2',
        exactTag: 'v0.1.0-preview.2',
        allowUnsignedPreview: true,
      }),
    ).toMatchObject({
      channel: 'preview',
      signingMode: 'unsigned-preview',
      explicitUnsignedPreviewOptIn: true,
    });
  });

  it.each([
    ['0.1.0-preview.2', 'v0.1.0-preview.2', false],
    ['0.1.0-rc.1', 'v0.1.0-rc.1', true],
    ['0.1.0', 'v0.1.0', true],
  ])('fails closed without signing material for %s', (version, exactTag, allowUnsignedPreview) => {
    expect(() =>
      resolveProductReleasePolicy({ version, exactTag, allowUnsignedPreview }),
    ).toThrow();
  });

  it('rejects a mismatched tag before evaluating signing policy', () => {
    expect(() =>
      resolveProductReleasePolicy({
        version: '0.1.0-preview.2',
        exactTag: 'v0.1.0-preview.1',
        allowUnsignedPreview: true,
      }),
    ).toThrow(/does not match/);
  });

  it.each([
    ['0.1.0-preview.2', 'v0.1.0-preview.2', 'preview'],
    ['0.1.0-rc.1', 'v0.1.0-rc.1', 'release-candidate'],
    ['0.1.0', 'v0.1.0', 'stable'],
  ])('selects signed mode for %s when signing material exists', (version, exactTag, channel) => {
    expect(
      resolveProductReleasePolicy({ version, exactTag, signingMaterialAvailable: true }),
    ).toMatchObject({ channel, signingMode: 'signed' });
  });

  it('includes the Windows build by default', () => {
    expect(
      resolveProductReleasePolicy({
        version: '0.1.0-preview.5',
        exactTag: 'v0.1.0-preview.5',
        allowUnsignedPreview: true,
      }),
    ).toMatchObject({ windowsIncluded: true });
  });

  it('permits excluding the Windows build only for an explicitly opted-in Preview', () => {
    // Owner directive 2026-07-18 (plan v2.1): Windows is deferred pending a
    // full rewrite, so a Preview may ship platform/web artifacts only. The
    // unsigned-preview opt-in still applies to what does ship.
    expect(
      resolveProductReleasePolicy({
        version: '0.1.0-preview.5',
        exactTag: 'v0.1.0-preview.5',
        allowUnsignedPreview: true,
        includeWindows: false,
      }),
    ).toMatchObject({
      channel: 'preview',
      signingMode: 'unsigned-preview',
      windowsIncluded: false,
    });
    // Excluding Windows never waives the explicit unsigned-preview opt-in.
    expect(() =>
      resolveProductReleasePolicy({
        version: '0.1.0-preview.5',
        exactTag: 'v0.1.0-preview.5',
        includeWindows: false,
      }),
    ).toThrow(/allow_unsigned_preview/);
  });

  it('never resolves a windows-excluded run as signed, even with signing material', () => {
    // The Windows job is the only signing job, so configured SignPath
    // material must not silently flip a windows-excluded Preview to 'signed'
    // (which would skip both the signing round trip and the unsigned-preview
    // warning). The exclusion always requires the explicit opt-in and always
    // ships as a labeled unsigned Preview.
    expect(() =>
      resolveProductReleasePolicy({
        version: '0.1.0-preview.5',
        exactTag: 'v0.1.0-preview.5',
        signingMaterialAvailable: true,
        includeWindows: false,
      }),
    ).toThrow(/allow_unsigned_preview/);
    expect(
      resolveProductReleasePolicy({
        version: '0.1.0-preview.5',
        exactTag: 'v0.1.0-preview.5',
        signingMaterialAvailable: true,
        allowUnsignedPreview: true,
        includeWindows: false,
      }),
    ).toMatchObject({
      signingMode: 'unsigned-preview',
      explicitUnsignedPreviewOptIn: true,
      windowsIncluded: false,
    });
  });

  it.each([
    ['0.1.0-rc.1', 'v0.1.0-rc.1'],
    ['0.1.0', 'v0.1.0'],
  ])('refuses to exclude the Windows build from %s', (version, exactTag) => {
    expect(() =>
      resolveProductReleasePolicy({
        version,
        exactTag,
        signingMaterialAvailable: true,
        includeWindows: false,
      }),
    ).toThrow(/Preview-only/);
  });
});

describe('product Windows signing evidence', () => {
  const subject = {
    name: 'ApiaryLensSetup-UNSIGNED-PREVIEW.exe',
    bytes: 100,
    sha256: 'a'.repeat(64),
  };

  it('records visibly unsigned exact Preview subjects without claiming Authenticode', () => {
    expect(
      createWindowsSigningEvidence({
        productVersion: '0.1.0-preview.2',
        sourceCommit: 'b'.repeat(40),
        releaseCommit: 'c'.repeat(40),
        exactTag: 'v0.1.0-preview.2',
        signingMode: 'unsigned-preview',
        explicitUnsignedPreviewOptIn: true,
        subjects: [subject],
      }),
    ).toMatchObject({ signingMode: 'unsigned-preview', authenticode: { status: 'unsigned' } });
  });

  it('rejects unsigned RCs, missing opt-in, and an ambiguous Setup filename', () => {
    for (const input of [
      { productVersion: '0.1.0-rc.1', explicitUnsignedPreviewOptIn: true, subjects: [subject] },
      {
        productVersion: '0.1.0-preview.2',
        explicitUnsignedPreviewOptIn: false,
        subjects: [subject],
      },
      {
        productVersion: '0.1.0-preview.2',
        explicitUnsignedPreviewOptIn: true,
        subjects: [{ ...subject, name: 'ApiaryLensSetup.exe' }],
      },
    ]) {
      expect(() =>
        createWindowsSigningEvidence({
          sourceCommit: 'b'.repeat(40),
          releaseCommit: 'c'.repeat(40),
          exactTag: `v${input.productVersion}`,
          signingMode: 'unsigned-preview',
          ...input,
        }),
      ).toThrow();
    }
  });

  it('regenerates package and visible unsigned Setup URLs with exact hashes', () => {
    const packageBytes = Buffer.from('{"schemaVersion":1}\n');
    const artifacts = createWindowsProductArtifacts('0.1.0-preview.2', packageBytes, [
      subject,
      { name: 'RELEASES', bytes: 10, sha256: 'b'.repeat(64) },
    ]);
    expect(artifacts).toHaveLength(3);
    expect(artifacts[0]).toMatchObject({
      name: 'windows-package.json',
      bytes: packageBytes.length,
      sha256: '80f3d90666804a9335821cdb40782458835ffedaef33088bd1dc5eb3ef85ce61',
    });
    expect(artifacts[1].url).toBe(
      'https://apiarylens.org/releases/0.1.0-preview.2/artifacts/windows/ApiaryLensSetup-UNSIGNED-PREVIEW.exe',
    );
  });
});
