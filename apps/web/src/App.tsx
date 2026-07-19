import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SessionView } from '@apiarylens/contracts';
import { api, type BootstrapSession } from './api.js';
import {
  cacheSession,
  cachedSession,
  clearCachedSession,
  clearLocalWorkspace,
  db,
  isRetryableSyncError,
  LOCAL_CHANGE_EVENT,
  requiresSessionRefresh,
  synchronize,
} from './db.js';
import { OnlineSyncScheduler, type SyncTrigger } from './sync-scheduler.js';
import { pageTitles, sidebarTarget, type Page, type PageRequest } from './navigation.js';
import type { ActiveSession } from './session.js';
import {
  applyThemeMode,
  loadThemeMode,
  nextThemeMode,
  themeModeLabel,
  themeStorageKey,
  type ThemeMode,
} from './theme.js';
import { AuthScreen } from './features/auth/AuthScreen.js';
import { RecoveryCodes } from './features/auth/RecoveryCodes.js';
import { Dashboard } from './features/overview/OverviewPage.js';
import { Apiaries } from './features/apiaries/ApiariesPage.js';
import { ApiaryDetail } from './features/apiaries/ApiaryDetail.js';
import { Hives } from './features/hives/HivesPage.js';
import { HiveDetail } from './features/hives/HiveDetail.js';
import { Inspections } from './features/inspections/InspectionsPage.js';
import { CareRecords } from './features/care/CarePage.js';
import { AboutPage } from './features/about/AboutPage.js';
import { VersionView } from './features/account/AccountPage.js';
import { GlossaryContext } from './features/glossary/glossary-context.js';
import { GlossaryPanel } from './features/glossary/GlossaryPanel.js';

// Inside the Windows standalone shell the backend is an embedded loopback
// service, so external connectivity (navigator.onLine) must never gate the
// launch, synchronization, or onboarding paths (WIN-028).
const desktopStandalone = api.desktopStandalone();
// Local-only sessions (no cloud backend — design v2 §1c, WEB-001) show NO
// sync affordance anywhere: no Sync now button, no sync status, no queued
// counts. Writing to the embedded local database still happens continuously
// in the background; it is plumbing, not family-facing state. In exchange,
// local backup and restore are first-class (Administration → Backup & restore).
const localOnly = api.localOnlySession();

/** Minimal typing for the Chromium install prompt event (PWA install). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const workspaceNav = [
  ['dashboard', '▦', 'Overview'],
  ['apiaries', '⌂', 'Apiaries'],
  ['hives', '▤', 'Hives'],
  ['inspections', '✎', 'Inspections'],
  ['care', '✚', 'Care'],
] as const satisfies ReadonlyArray<readonly [Page, string, string]>;

export function App() {
  const [session, setSession] = useState<ActiveSession>();
  const [loading, setLoading] = useState(true);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [bootstrapTokenRequired, setBootstrapTokenRequired] = useState(false);
  const [offline, setOffline] = useState(desktopStandalone ? false : !navigator.onLine);
  const [pageRequest, setPageRequest] = useState<PageRequest>({ page: 'dashboard' });
  const [glossary, setGlossary] = useState<{ open: boolean; termId?: string }>({ open: false });
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration>();
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    loadThemeMode(localStorage.getItem(themeStorageKey)),
  );
  // Narrow viewports hide the sidebar; this opens it as a drawer so About,
  // the theme control, install, and Administration stay reachable on phones.
  const [sideOpen, setSideOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const sessionRef = useRef<ActiveSession | undefined>(undefined);
  const schedulerRef = useRef<OnlineSyncScheduler | undefined>(undefined);
  const pendingWork = useLiveQuery(
    async () => {
      const [operations, media] = await Promise.all([
        db.outbox.count(),
        db.media.filter((item) => item.state !== 'ready').count(),
      ]);
      return operations + media;
    },
    [],
    0,
  );

  useEffect(() => {
    applyThemeMode(document.documentElement, themeMode);
    if (themeMode === 'auto') localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode]);

  useEffect(() => {
    const syncNotice = (trigger: SyncTrigger) => {
      if (trigger === 'save') return 'Saved and synchronized.';
      if (trigger === 'reconnect') return 'Reconnected and synchronized.';
      if (trigger === 'retry') return 'Connection restored and synchronization complete.';
      return 'Synchronization complete.';
    };
    const scheduler = new OnlineSyncScheduler({
      isOnline: () => desktopStandalone || navigator.onLine,
      synchronize: async (signal) => {
        let active = sessionRef.current;
        if (!active?.csrfToken) {
          const refreshed = await api.session();
          signal.throwIfAborted();
          await cacheSession(refreshed);
          active = refreshed;
          sessionRef.current = refreshed;
          setSession(refreshed);
        }
        const csrfToken = active.csrfToken;
        if (!csrfToken) throw new Error('Reconnect before synchronizing.');
        try {
          await synchronize(active.organization.id, csrfToken, signal);
        } catch (error) {
          if (!requiresSessionRefresh(error)) throw error;
          const refreshed = await api.session();
          signal.throwIfAborted();
          await cacheSession(refreshed);
          sessionRef.current = refreshed;
          setSession(refreshed);
          await synchronize(refreshed.organization.id, refreshed.csrfToken, signal);
        }
      },
      shouldRetry: isRetryableSyncError,
      onStart: () => setSyncing(true),
      onSuccess: (trigger) => {
        setSyncing(false);
        setLastSyncAt(new Date());
        // Local-only sessions never announce synchronization — background
        // writes to this computer's database are silent plumbing (WEB-001).
        if (!localOnly) setNotice(syncNotice(trigger));
      },
      onError: (error) => {
        setSyncing(false);
        if (localOnly) {
          setNotice(
            isRetryableSyncError(error)
              ? 'Your work is saved in the app and keeps writing to this computer automatically.'
              : error instanceof Error
                ? error.message
                : 'Saving to this computer needs attention.',
          );
          return;
        }
        setNotice(
          isRetryableSyncError(error)
            ? 'Your work is saved on this device. Synchronization will retry automatically.'
            : error instanceof Error
              ? error.message
              : 'Synchronization needs attention.',
        );
      },
      onCanceled: () => setSyncing(false),
    });
    schedulerRef.current = scheduler;
    const online = () => {
      setOffline(false);
      void scheduler.request('reconnect');
    };
    const offlineHandler = () => {
      if (!desktopStandalone) setOffline(true);
    };
    const resume = () => {
      if (document.visibilityState === 'visible') void scheduler.request('resume');
    };
    const open = () => void scheduler.request('open');
    const localChange = () => void scheduler.request('save');
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineHandler);
    window.addEventListener('pageshow', open);
    window.addEventListener(LOCAL_CHANGE_EVENT, localChange);
    document.addEventListener('visibilitychange', resume);
    const updateReady = (event: Event) =>
      setUpdateRegistration((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener('apiarylens:update-ready', updateReady);
    const installReady = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', installReady);
    void initialize(scheduler);
    return () => {
      scheduler.stop();
      schedulerRef.current = undefined;
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offlineHandler);
      window.removeEventListener('pageshow', open);
      window.removeEventListener(LOCAL_CHANGE_EVENT, localChange);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('apiarylens:update-ready', updateReady);
      window.removeEventListener('beforeinstallprompt', installReady);
    };
  }, []);

  async function initialize(scheduler: OnlineSyncScheduler) {
    try {
      if (new URLSearchParams(location.search).get('reset-demo') === '1') {
        await clearLocalWorkspace();
        history.replaceState(null, '', location.pathname);
      }
      const cached = await cachedSession();
      if (cached) {
        const offlineSession = { ...cached, csrfToken: undefined };
        sessionRef.current = offlineSession;
        setSession(offlineSession);
        // Render the durable local workspace immediately. An iOS PWA can report
        // online while its first request stalls after process termination; that
        // network refresh must never hold the cached app behind the launch gate.
        setLoading(false);
      }
      if (!navigator.onLine && !desktopStandalone) {
        setOffline(true);
        return;
      }
      const active = await api.session();
      await cacheSession(active);
      sessionRef.current = active;
      setSession(active);
      if (desktopStandalone || navigator.onLine) void scheduler.request('open');
    } catch {
      // Disconnected Windows onboarding: the host provisions and signs in a
      // device-managed owner, so a clean install reaches the hive workspace
      // with zero account creation and zero network access. When the host
      // declines (a person-created account exists), the standard
      // authentication screen appears instead.
      if (api.deviceOwnerProvisioningAvailable()) {
        try {
          await establish(await api.provisionDeviceOwner());
          return;
        } catch {
          // Fall through to the standard authentication screen.
        }
      }
      try {
        const status = await api.bootstrapStatus();
        setBootstrapAvailable(status.available);
        setBootstrapTokenRequired(Boolean(status.requiresToken));
      } catch {
        setOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function establish(active: SessionView | BootstrapSession) {
    await cacheSession(active);
    sessionRef.current = active;
    setSession(active);
    if ('recoveryCodes' in active) setRecoveryCodes(active.recoveryCodes);
    setNotice('Workspace ready.');
    void schedulerRef.current?.request('open');
  }

  async function sync() {
    await schedulerRef.current?.request('manual');
  }

  async function signOut() {
    schedulerRef.current?.cancel();
    try {
      if (session?.csrfToken) await api.signOut(session.csrfToken);
    } finally {
      await clearCachedSession();
      sessionRef.current = undefined;
      setSession(undefined);
      setNotice('Signed out. Local records remain on this device until you clear them.');
    }
  }

  function installUpdate() {
    if (!updateRegistration?.waiting || pendingWork > 0) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });
    updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  function installApp() {
    if (!installPrompt) return;
    void installPrompt.prompt();
    setInstallPrompt(undefined);
  }

  if (loading) return <main className="center-card">Opening your apiary…</main>;
  if (!session) {
    return (
      <AuthScreen
        bootstrapAvailable={bootstrapAvailable}
        bootstrapTokenRequired={bootstrapTokenRequired}
        offline={offline}
        onAuthenticated={establish}
      />
    );
  }

  const page = pageRequest.page;
  const activeSidebar = sidebarTarget(page);
  const activeAccountSection =
    page === 'version' ? (pageRequest.accountSection ?? 'account') : undefined;
  const canWrite = session.membership.role !== 'viewer';
  const isOwner = session.membership.role === 'owner';
  // Members and Backup & restore are owner-only sections of the account page;
  // other roles get only the Account entry so no sidebar target is a dead end.
  const adminNav = (
    [
      ['members', '◉', 'Members'],
      ['backup', '⛁', 'Backup & restore'],
      ['account', '⚙', 'Account'],
    ] as const
  ).filter(([section]) => isOwner || section === 'account');
  const navigate = (request: PageRequest) => {
    setPageRequest(request);
    setSideOpen(false);
  };
  const sideNavButton = (target: Page, icon: string, label: string) => (
    <button
      key={target}
      type="button"
      className={activeSidebar === target ? 'active' : ''}
      aria-current={activeSidebar === target ? 'page' : undefined}
      onClick={() => navigate({ page: target })}
    >
      <span className="ico" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );

  return (
    <div className="app-shell">
      {sideOpen && (
        <button
          className="side-backdrop"
          aria-label="Close menu"
          onClick={() => setSideOpen(false)}
        ></button>
      )}
      <aside
        id="app-sidebar"
        className={`sidebar${sideOpen ? ' open' : ''}`}
        aria-label="ApiaryLens navigation"
      >
        <div className="brand">
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            stroke="#f5b83d"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M10 1.5l7 4v9l-7 4-7-4v-9z" />
            <circle cx="10" cy="10" r="2.6" fill="#f5b83d" stroke="none" />
          </svg>
          ApiaryLens
        </div>
        <div className="side-h" id="nav-workspace">
          Workspace
        </div>
        <nav className="snav" aria-labelledby="nav-workspace">
          {workspaceNav.map(([target, icon, label]) => sideNavButton(target, icon, label))}
        </nav>
        <div className="side-h" id="nav-reference">
          Reference
        </div>
        <nav className="snav" aria-labelledby="nav-reference">
          <button
            type="button"
            onClick={() => {
              setGlossary({ open: true });
              setSideOpen(false);
            }}
            aria-haspopup="dialog"
          >
            <span className="ico" aria-hidden="true">
              ✱
            </span>
            Glossary
          </button>
          {sideNavButton('about', 'ⓘ', 'About')}
        </nav>
        <div className="side-h" id="nav-administration">
          Administration
        </div>
        <nav className="snav" aria-labelledby="nav-administration">
          {adminNav.map(([section, icon, label]) => (
            <button
              key={section}
              type="button"
              className={activeAccountSection === section ? 'active' : ''}
              aria-current={activeAccountSection === section ? 'page' : undefined}
              onClick={() => navigate({ page: 'version', accountSection: section })}
            >
              <span className="ico" aria-hidden="true">
                {icon}
              </span>
              {label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {localOnly ? (
            // No connectivity, sync, or queue affordances in local-only mode:
            // the only honest status is where the data lives (WEB-001).
            <>
              <span className="on">● Local</span> · all records stay on this computer
              <br />
            </>
          ) : (
            <>
              {offline ? (
                <span className="q">● Offline</span>
              ) : (
                <span className="on">● Online</span>
              )}
              {pendingWork > 0 && (
                <>
                  {' '}
                  · <span className="q">{pendingWork} queued</span>
                </>
              )}
              <br />
              {lastSyncAt
                ? `Last sync ${lastSyncAt.toLocaleTimeString()}`
                : 'Not synced this session'}
              <br />
            </>
          )}
          <span className="mono">{session.organization.name}</span>
          <button type="button" onClick={() => setThemeMode((mode) => nextThemeMode(mode))}>
            {themeModeLabel(themeMode)}
          </button>
          {installPrompt && (
            <button type="button" onClick={installApp}>
              Install app
            </button>
          )}
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button
            className="menu-btn"
            type="button"
            aria-expanded={sideOpen}
            aria-controls="app-sidebar"
            onClick={() => setSideOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span> Menu
          </button>
          <span className="crumb">
            <button
              className="account-link"
              onClick={() => setPageRequest({ page: 'version', accountSection: 'account' })}
            >
              {session.organization.name}
            </button>{' '}
            / <b>{pageTitles[page]}</b>
          </span>
          <span className="spacer"></span>
          <div className="top-actions">
            {!localOnly && (
              <span className={`connectivity ${offline ? 'offline' : ''}`}>
                {offline ? 'OFFLINE' : 'ONLINE'}
              </span>
            )}
            {!localOnly && pendingWork > 0 && <span className="pill q">{pendingWork} QUEUED</span>}
            <button
              className="button secondary"
              onClick={() => setGlossary({ open: true })}
              aria-haspopup="dialog"
            >
              Glossary
            </button>
            {!localOnly && (
              <button
                className="button secondary"
                onClick={() => void sync()}
                disabled={syncing || offline}
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            {canWrite && (
              <button
                className="button primary"
                onClick={() => setPageRequest({ page: 'inspections' })}
              >
                New inspection
              </button>
            )}
          </div>
        </header>

        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label="Dismiss message" onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}

        {updateRegistration && (
          <div className="update-notice" role="status">
            <div>
              <strong>ApiaryLens update ready</strong>
              <span>
                {pendingWork > 0
                  ? localOnly
                    ? `${pendingWork} recent item${pendingWork === 1 ? '' : 's'} are still being written to this computer. That finishes automatically — install afterwards.`
                    : `${pendingWork} local item${pendingWork === 1 ? '' : 's'} remain safely on this device. Synchronize them before updating.`
                  : 'Your local work is clear. Install when you are ready.'}
              </span>
            </div>
            <button className="button secondary" disabled={pendingWork > 0} onClick={installUpdate}>
              {pendingWork > 0
                ? localOnly
                  ? 'Waiting for save'
                  : 'Waiting for sync'
                : 'Install update'}
            </button>
          </div>
        )}

        {recoveryCodes.length > 0 && (
          <RecoveryCodes codes={recoveryCodes} onSaved={() => setRecoveryCodes([])} />
        )}

        <GlossaryContext.Provider
          value={{
            open: (termId?: string) => setGlossary({ open: true, ...(termId ? { termId } : {}) }),
          }}
        >
          <main className="content">
            {page === 'dashboard' && (
              <Dashboard organizationId={session.organization.id} onNavigate={setPageRequest} />
            )}
            {page === 'apiaries' && (
              <Apiaries
                organizationId={session.organization.id}
                onNotice={setNotice}
                canWrite={canWrite}
                onNavigate={setPageRequest}
              />
            )}
            {page === 'apiary' && pageRequest.apiaryId && (
              <ApiaryDetail
                organizationId={session.organization.id}
                apiaryId={pageRequest.apiaryId}
                onNavigate={setPageRequest}
              />
            )}
            {page === 'hives' && (
              <Hives
                organizationId={session.organization.id}
                onNotice={setNotice}
                canWrite={canWrite}
                onNavigate={setPageRequest}
                {...(pageRequest.hiveStatus ? { initialStatusFilter: pageRequest.hiveStatus } : {})}
              />
            )}
            {page === 'hive' && pageRequest.hiveId && (
              <HiveDetail
                organizationId={session.organization.id}
                hiveId={pageRequest.hiveId}
                onNavigate={setPageRequest}
              />
            )}
            {page === 'inspections' && (
              <Inspections
                organizationId={session.organization.id}
                onNotice={setNotice}
                canWrite={canWrite}
                {...(pageRequest.hiveId ? { initialHiveId: pageRequest.hiveId } : {})}
              />
            )}
            {page === 'care' && (
              <CareRecords
                organizationId={session.organization.id}
                onNotice={setNotice}
                canWrite={canWrite}
                {...(pageRequest.careView ? { initialView: pageRequest.careView } : {})}
                {...(pageRequest.hiveId ? { initialHiveId: pageRequest.hiveId } : {})}
              />
            )}
            {page === 'about' && <AboutPage offline={offline} />}
            {page === 'version' && (
              <VersionView
                session={session}
                {...(pageRequest.accountSection ? { section: pageRequest.accountSection } : {})}
                onSignOut={() => void signOut()}
                onClear={() => void clearLocalWorkspace().then(() => location.reload())}
                // Local backup drains the outbox before exporting so the
                // downloaded file carries the newest work.
                onFlushPending={() => schedulerRef.current?.request('manual') ?? Promise.resolve()}
                // Restore cutover: no queued write may push into a freshly
                // restored database, so synchronization is suspended for the
                // whole restore and resumed only when the restore fails.
                onSuspendSync={() => schedulerRef.current?.stop()}
                onResumeSync={() => {
                  schedulerRef.current?.resume();
                  void schedulerRef.current?.request('open');
                }}
              />
            )}
          </main>
        </GlossaryContext.Provider>

        {glossary.open && (
          <GlossaryPanel
            {...(glossary.termId ? { initialTermId: glossary.termId } : {})}
            onClose={() => setGlossary({ open: false })}
          />
        )}

        <nav className="bottom-nav" aria-label="Primary navigation">
          {(
            [
              ['dashboard', 'Overview'],
              ['apiaries', 'Apiaries'],
              ['hives', 'Hives'],
              ['inspections', 'Inspect'],
              ['care', 'Care'],
            ] as const
          ).map(([target, label]) => (
            <button
              key={target}
              className={activeSidebar === target ? 'active' : ''}
              aria-current={activeSidebar === target ? 'page' : undefined}
              onClick={() => setPageRequest({ page: target })}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
