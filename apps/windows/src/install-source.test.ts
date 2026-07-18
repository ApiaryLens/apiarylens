import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parsePackageManagerArgument,
  readInstallSourceMarker,
  resolveInstallOwnership,
  writeInstallSourceMarker,
} from './install-source.js';

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function markerPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'apiarylens-install-source-'));
  temporaryRoots.push(root);
  mkdirSync(join(root, 'updates'), { recursive: true });
  return join(root, 'updates', 'install-source.v1.json');
}

describe('package-manager install-source marker', () => {
  it('parses only the supported forwarded install switches', () => {
    expect(parsePackageManagerArgument(['ApiaryLens.exe'])).toBeUndefined();
    expect(parsePackageManagerArgument(['ApiaryLens.exe', '--package-manager=winget'])).toBe(
      'winget',
    );
    expect(parsePackageManagerArgument(['--package-manager=chocolatey'])).toBe('chocolatey');
    expect(() => parsePackageManagerArgument(['--package-manager=apt'])).toThrow('apt');
    expect(() => parsePackageManagerArgument(['--package-manager='])).toThrow('empty');
  });

  it('writes the shared one-schema marker and reads it back', () => {
    const path = markerPath();
    const written = writeInstallSourceMarker(
      path,
      'winget',
      () => new Date('2026-07-18T00:00:00Z'),
    );
    expect(written).toEqual({
      schemaVersion: 1,
      source: 'winget',
      recordedAt: '2026-07-18T00:00:00.000Z',
    });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(written);
    expect(readInstallSourceMarker(path)).toEqual(written);
  });

  it('lets the most recent install-time source replace an earlier channel', () => {
    const path = markerPath();
    writeInstallSourceMarker(path, 'winget');
    writeInstallSourceMarker(path, 'chocolatey');
    expect(readInstallSourceMarker(path)).toMatchObject({ source: 'chocolatey' });
  });

  it('treats a missing marker as app ownership and any invalid marker as suppression', () => {
    const path = markerPath();
    expect(readInstallSourceMarker(path)).toBeUndefined();
    expect(resolveInstallOwnership(path)).toEqual({ owner: 'app', selfUpdateApplyAllowed: true });

    for (const hostile of [
      'not json',
      '[]',
      'null',
      '{"schemaVersion":2,"source":"winget","recordedAt":"2026-07-18T00:00:00Z"}',
      '{"schemaVersion":1,"source":"apt","recordedAt":"2026-07-18T00:00:00Z"}',
      '{"schemaVersion":1,"source":"winget","recordedAt":"not a date"}',
      '{"schemaVersion":1,"source":"winget"}',
    ]) {
      writeFileSync(path, hostile);
      expect(readInstallSourceMarker(path)).toBe('invalid');
      expect(resolveInstallOwnership(path)).toEqual({
        owner: 'unknown',
        selfUpdateApplyAllowed: false,
      });
    }
  });

  it('names the owning package manager when a valid marker is present', () => {
    const path = markerPath();
    writeInstallSourceMarker(path, 'chocolatey');
    expect(resolveInstallOwnership(path)).toEqual({
      owner: 'chocolatey',
      selfUpdateApplyAllowed: false,
    });
  });
});
