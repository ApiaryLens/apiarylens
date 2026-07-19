import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { clearLocalWorkspace, lastLocalBackupAt, recordLocalBackup } from './db.js';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const overviewSource = readFileSync(
  new URL('./features/overview/OverviewPage.tsx', import.meta.url),
  'utf8',
);
const accountSource = readFileSync(
  new URL('./features/account/AccountPage.tsx', import.meta.url),
  'utf8',
);
const syncBadgeSource = readFileSync(
  new URL('./components/SyncBadge.tsx', import.meta.url),
  'utf8',
);

/**
 * WEB-001 / design v2 §1c owner rule: local-only sessions (no cloud backend)
 * show NO sync affordance anywhere — absent, not disabled — and get
 * first-class local backup and restore in exchange. These pins keep every
 * sync affordance behind the connected gate and the backup surface present.
 */
describe('local-only (standalone) mode', () => {
  it('detects the mode from the connection-profile model: bridge present means local-only', () => {
    expect(apiSource).toContain('localOnlySession: () => Boolean(desktopBridge())');
    expect(appSource).toContain('const localOnly = api.localOnlySession()');
  });

  it('renders the Sync now button only for connected sessions — absent, not disabled', () => {
    // The button, the connectivity pill, and the queued pill all sit inside
    // the connected-only gate in the topbar.
    expect(appSource).toMatch(
      /\{!localOnly && \(\s*<button[^>]*\n?[\s\S]{0,220}\{syncing \? 'Syncing…' : 'Sync now'\}/,
    );
    expect(appSource).toMatch(/\{!localOnly && \(\s*<span className=\{`connectivity/);
    expect(appSource).toContain(
      '{!localOnly && pendingWork > 0 && <span className="pill q">{pendingWork} QUEUED</span>}',
    );
  });

  it('replaces the sidebar sync status with an honest local-data line', () => {
    const footer = appSource.slice(
      appSource.indexOf('className="side-foot"'),
      appSource.indexOf('</aside>'),
    );
    expect(footer).toContain('{localOnly ? (');
    expect(footer).toContain('all records stay on this computer');
    // The connected-only branch keeps the sync status strings.
    expect(footer).toContain('Not synced this session');
    expect(footer).toContain('{pendingWork} queued');
  });

  it('keeps background writing silent: no synchronization notices in local-only mode', () => {
    expect(appSource).toContain('if (!localOnly) setNotice(syncNotice(trigger))');
  });

  it('words the update-ready guard without sync language in local-only mode', () => {
    expect(appSource).toMatch(/localOnly\s*\?\s*'Waiting for save'\s*:\s*'Waiting for sync'/);
    expect(appSource).toContain('still being written to this computer');
  });

  it('swaps the overview pending-sync block for the local-backup block', () => {
    expect(overviewSource).toContain('{localOnly ? (');
    expect(overviewSource).toContain("accountSection: 'backup'");
    expect(overviewSource).toContain('no backup recorded on this device');
    // The Outbox block stays connected-only.
    const outbox = overviewSource.indexOf('<article className="metric pending">');
    expect(outbox).toBeGreaterThan(overviewSource.indexOf('{localOnly ? ('));
  });

  it('hides per-record sync badges and the follow-up Sync column in local-only mode', () => {
    expect(syncBadgeSource).toContain('if (api.localOnlySession()) return null');
    expect(overviewSource).toContain('{!api.localOnlySession() && <th>Sync</th>}');
    expect(overviewSource).toContain('{!api.localOnlySession() && (');
  });

  it('gives local-only owners the first-class backup section in the prominent first slot', () => {
    expect(accountSource).toContain('function LocalBackupSection');
    // Rendered before the build-details card for local-only owners.
    expect(accountSource.indexOf('{localOnly && isOwner && (')).toBeLessThan(
      accountSource.indexOf('<section className="card details">'),
    );
    expect(accountSource).toContain('Download backup file');
    expect(accountSource).toContain('Restore from backup file…');
    expect(accountSource).toContain('records live only on this computer');
  });

  it('warns honestly before any restore overwrites the workspace', () => {
    expect(accountSource).toContain('Yes, replace everything');
    expect(accountSource).toContain(
      "Restoring replaces every record and photo in this apiary with the backup's contents.",
    );
    expect(accountSource).toContain('will be gone');
    // The server verifies the file before anything changes; the UI says so.
    expect(accountSource).toContain('a damaged or foreign file is refused and');
  });

  it('uploads the chosen file through the verified import endpoint and reloads the replica', () => {
    expect(apiSource).toContain("'/api/v1/import/full'");
    expect(accountSource).toContain('.importFullBackup(csrfToken, request.file)');
    expect(accountSource).toContain('setTimeout(onRestored, 1500)');
  });

  it('drains pending writes before exporting and records a backup only after it downloads', () => {
    // A backup presented as the family's authoritative copy must carry their
    // newest work, and the backup-health timestamp must never record an
    // export that failed.
    expect(accountSource).toContain('await flushPending();');
    const flushed = accountSource.indexOf('await flushPending();');
    const pendingCheck = accountSource.indexOf('pendingOperations + pendingMedia > 0', flushed);
    const fetched = accountSource.indexOf("fetch('/api/v1/export/full'", pendingCheck);
    const okGuard = accountSource.indexOf('if (!response.ok) throw', fetched);
    const recorded = accountSource.indexOf('await recordLocalBackup();', okGuard);
    expect(pendingCheck).toBeGreaterThan(flushed);
    expect(fetched).toBeGreaterThan(pendingCheck);
    expect(okGuard).toBeGreaterThan(fetched);
    expect(recorded).toBeGreaterThan(okGuard);
    const appWiring = appSource.indexOf("schedulerRef.current?.request('manual')");
    expect(appWiring).toBeGreaterThan(-1);
  });

  it('suspends synchronization for the whole restore cutover', () => {
    // No queued write may push into a freshly restored database and
    // reintroduce data the overwrite warning promised would be gone.
    const confirm = accountSource.indexOf('function confirmRestore()');
    const suspended = accountSource.indexOf('suspendSync();', confirm);
    const imported = accountSource.indexOf('.importFullBackup(', suspended);
    expect(suspended).toBeGreaterThan(confirm);
    expect(imported).toBeGreaterThan(suspended);
    // A failed restore resumes normal scheduling.
    expect(accountSource).toContain('resumeSync();');
    expect(appSource).toContain('onSuspendSync={() => schedulerRef.current?.stop()}');
    expect(appSource).toContain('schedulerRef.current?.resume()');
  });
});

describe('local backup signal', () => {
  afterEach(async () => {
    await clearLocalWorkspace();
  });

  it('remembers the newest backup taken from this device and forgets it with the workspace', async () => {
    expect(await lastLocalBackupAt()).toBeUndefined();
    await recordLocalBackup();
    const recorded = await lastLocalBackupAt();
    expect(recorded).toBeDefined();
    expect(Number.isNaN(Date.parse(recorded!))).toBe(false);
    await clearLocalWorkspace();
    expect(await lastLocalBackupAt()).toBeUndefined();
  });
});
