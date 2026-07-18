import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readWindowsModeChoice,
  resolveWindowsStartupMode,
  saveWindowsModeChoice,
} from './first-run.js';

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryModePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'apiarylens-windows-mode-'));
  temporaryRoots.push(root);
  return join(root, 'windows-mode.v1.json');
}

describe('Windows mode persistence', () => {
  it('round-trips both supported modes durably', () => {
    const path = temporaryModePath();
    expect(readWindowsModeChoice(path)).toBeUndefined();
    saveWindowsModeChoice(path, 'disconnected');
    expect(readWindowsModeChoice(path)).toBe('disconnected');
    saveWindowsModeChoice(path, 'connected');
    expect(readWindowsModeChoice(path)).toBe('connected');
    const persisted = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(persisted.version).toBe(1);
    expect(Number.isFinite(Date.parse(String(persisted.chosenAt)))).toBe(true);
  });

  it('treats corrupted or foreign mode records as unset, never as a mode', () => {
    const path = temporaryModePath();
    for (const content of [
      'not json',
      '{"version":1,"mode":"cloud","chosenAt":"2026-07-18T00:00:00.000Z"}',
      '{"version":2,"mode":"disconnected","chosenAt":"2026-07-18T00:00:00.000Z"}',
      '{"version":1,"mode":"disconnected"}',
      '"disconnected"',
    ]) {
      writeFileSync(path, content);
      expect(readWindowsModeChoice(path)).toBeUndefined();
    }
  });
});

describe('Windows first-run detection', () => {
  it('requires the mode chooser only on a genuinely clean profile', () => {
    expect(
      resolveWindowsStartupMode({
        savedMode: undefined,
        connectionProfileExists: false,
        standaloneDataExists: false,
      }),
    ).toBe('chooser');
  });

  it('honors a persisted disconnected choice without any account or network gate', () => {
    expect(
      resolveWindowsStartupMode({
        savedMode: 'disconnected',
        connectionProfileExists: false,
        standaloneDataExists: false,
      }),
    ).toBe('disconnected');
    expect(
      resolveWindowsStartupMode({
        savedMode: 'disconnected',
        connectionProfileExists: true,
        standaloneDataExists: true,
      }),
    ).toBe('disconnected');
  });

  it('honors a persisted connected choice only while its profile exists', () => {
    expect(
      resolveWindowsStartupMode({
        savedMode: 'connected',
        connectionProfileExists: true,
        standaloneDataExists: false,
      }),
    ).toBe('connected');
    expect(
      resolveWindowsStartupMode({
        savedMode: 'connected',
        connectionProfileExists: false,
        standaloneDataExists: false,
      }),
    ).toBe('chooser');
  });

  it('adopts pre-chooser installs from the data they already hold', () => {
    expect(
      resolveWindowsStartupMode({
        savedMode: undefined,
        connectionProfileExists: true,
        standaloneDataExists: false,
      }),
    ).toBe('connected');
    expect(
      resolveWindowsStartupMode({
        savedMode: undefined,
        connectionProfileExists: false,
        standaloneDataExists: true,
      }),
    ).toBe('disconnected');
    expect(
      resolveWindowsStartupMode({
        savedMode: undefined,
        connectionProfileExists: true,
        standaloneDataExists: true,
      }),
    ).toBe('connected');
  });
});
