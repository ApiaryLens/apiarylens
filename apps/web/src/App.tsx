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
import type { PageRequest } from './navigation.js';
import type { ActiveSession } from './session.js';
import { AuthScreen } from './features/auth/AuthScreen.js';
import { RecoveryCodes } from './features/auth/RecoveryCodes.js';
import { Dashboard } from './features/overview/OverviewPage.js';
import { Apiaries } from './features/apiaries/ApiariesPage.js';
import { Hives } from './features/hives/HivesPage.js';
import { Inspections } from './features/inspections/InspectionsPage.js';
import { CareRecords } from './features/care/CarePage.js';
import { VersionView } from './features/account/AccountPage.js';
import { GlossaryContext } from './features/glossary/glossary-context.js';
import { GlossaryPanel } from './features/glossary/GlossaryPanel.js';

// Inside the Windows standalone shell the backend is an embedded loopback
// service, so external connectivity (navigator.onLine) must never gate the
// launch, synchronization, or onboarding paths (WIN-028).
const desktopStandalone = api.desktopStandalone();

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
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration>();
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
        setNotice(syncNotice(trigger));
      },
      onError: (error) => {
        setSyncing(false);
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
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">ApiaryLens</span>
          <button className="account-link" onClick={() => setPageRequest({ page: 'version' })}>
            {session.organization.name}
          </button>
        </div>
        <div className="top-actions">
          <span className={`connectivity ${offline ? 'offline' : ''}`}>
            {offline ? 'Offline' : 'Online'}
          </span>
          <button
            className="button secondary"
            onClick={() => setGlossary({ open: true })}
            aria-haspopup="dialog"
          >
            Glossary
          </button>
          <button
            className="button secondary"
            onClick={() => void sync()}
            disabled={syncing || offline}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
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
                ? `${pendingWork} local item${pendingWork === 1 ? '' : 's'} remain safely on this device. Synchronize them before updating.`
                : 'Your local work is clear. Install when you are ready.'}
            </span>
          </div>
          <button className="button secondary" disabled={pendingWork > 0} onClick={installUpdate}>
            {pendingWork > 0 ? 'Waiting for sync' : 'Install update'}
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
              canWrite={session.membership.role !== 'viewer'}
            />
          )}
          {page === 'hives' && (
            <Hives
              organizationId={session.organization.id}
              onNotice={setNotice}
              canWrite={session.membership.role !== 'viewer'}
              {...(pageRequest.hiveStatus ? { initialStatusFilter: pageRequest.hiveStatus } : {})}
            />
          )}
          {page === 'inspections' && (
            <Inspections
              organizationId={session.organization.id}
              onNotice={setNotice}
              canWrite={session.membership.role !== 'viewer'}
              {...(pageRequest.hiveId ? { initialHiveId: pageRequest.hiveId } : {})}
            />
          )}
          {page === 'care' && (
            <CareRecords
              organizationId={session.organization.id}
              onNotice={setNotice}
              canWrite={session.membership.role !== 'viewer'}
              {...(pageRequest.careView ? { initialView: pageRequest.careView } : {})}
            />
          )}
          {page === 'version' && (
            <VersionView
              session={session}
              onSignOut={() => void signOut()}
              onClear={() => void clearLocalWorkspace().then(() => location.reload())}
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
            className={page === target ? 'active' : ''}
            aria-current={page === target ? 'page' : undefined}
            onClick={() => setPageRequest({ page: target })}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
