import { describe, expect, it } from 'vitest';
import { applySignedSetupRecord } from './apply-signed-windows-setup.mjs';

const signature = { publisher: 'CN=SignPath Foundation', thumbprint: 'AB'.repeat(20) };
const manifest = () => ({
  signed: false,
  artifacts: [
    { name: 'ApiaryLensSetup.exe', bytes: 10, sha256: 'a'.repeat(64) },
    { name: 'RELEASES', bytes: 5, sha256: 'b'.repeat(64) },
  ],
});

describe('applySignedSetupRecord', () => {
  it('re-anchors the Setup record to the signed bytes and records the signer', () => {
    const updated = applySignedSetupRecord(manifest(), {
      name: 'ApiaryLensSetup.exe',
      bytes: 12,
      sha256: 'c'.repeat(64),
      signature,
    });
    const setup = updated.artifacts.find((artifact) => artifact.name === 'ApiaryLensSetup.exe');
    expect(setup).toMatchObject({ bytes: 12, sha256: 'c'.repeat(64) });
    expect(updated.signed).toBe(true);
    expect(updated.signature).toEqual(signature);
    // Signing the Setup post-packaging must not touch any other artifact.
    expect(updated.artifacts.find((artifact) => artifact.name === 'RELEASES')).toMatchObject({
      bytes: 5,
      sha256: 'b'.repeat(64),
    });
  });

  it('fails closed when the manifest does not list the Setup', () => {
    expect(() =>
      applySignedSetupRecord(
        { artifacts: [] },
        { name: 'ApiaryLensSetup.exe', bytes: 12, sha256: 'c'.repeat(64), signature },
      ),
    ).toThrow(/does not list/);
  });

  it('fails closed when the bytes did not change (no signing round trip happened)', () => {
    expect(() =>
      applySignedSetupRecord(manifest(), {
        name: 'ApiaryLensSetup.exe',
        bytes: 10,
        sha256: 'a'.repeat(64),
        signature,
      }),
    ).toThrow(/unchanged/);
  });

  it('fails closed without a verified Authenticode signer identity', () => {
    expect(() =>
      applySignedSetupRecord(manifest(), {
        name: 'ApiaryLensSetup.exe',
        bytes: 12,
        sha256: 'c'.repeat(64),
        signature: { publisher: 'CN=SignPath Foundation' },
      }),
    ).toThrow(/publisher and thumbprint/);
  });
});
