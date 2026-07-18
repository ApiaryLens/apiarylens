import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createBuildIdentity, type BuildIdentity, type SessionView } from '@apiarylens/contracts';
import { api, type BootstrapSession } from './api.js';
import {
  cacheSession,
  cachedSession,
  clearCachedSession,
  clearLocalWorkspace,
  db,
  isRetryableSyncError,
  LOCAL_CHANGE_EVENT,
  queueCreate,
  queueDelete,
  queueUpdate,
  resolveConflict,
  requiresSessionRefresh,
  stageImage,
  synchronize,
  type LocalResource,
} from './db.js';
import { OnlineSyncScheduler, type SyncTrigger } from './sync-scheduler.js';
import {
  formatQueenIdentifier,
  queenColorForYear,
  type QueenIdentifierKind,
} from './queen-fields.js';
import {
  activeEquipmentForHive,
  adjacentEquipment,
  equipmentPurposeLabel,
  equipmentPurposeLabels,
  equipmentTypeLabel,
  equipmentTypeLabels,
  isFrameBox,
  nextEquipmentPosition,
  type EquipmentType,
} from './equipment-stack.js';
import { formatWeatherSummary, readManualWeatherSnapshot } from './weather-fields.js';
import { fieldChoices, mergeFieldChoices, recentFieldValues } from './field-intelligence.js';

type Page = 'dashboard' | 'apiaries' | 'hives' | 'inspections' | 'care' | 'version';
type ActiveSession = Omit<SessionView, 'csrfToken'> & { csrfToken: string | undefined };
// Inside the Windows standalone shell the backend is an embedded loopback
// service, so external connectivity (navigator.onLine) must never gate the
// launch, synchronization, or onboarding paths (WIN-028).
const desktopStandalone = api.desktopStandalone();
const frontendBuild = createBuildIdentity({
  deploymentProfile:
    (import.meta.env.VITE_DEPLOYMENT_PROFILE as BuildIdentity['deploymentProfile'] | undefined) ??
    'development',
  sourceCommit: import.meta.env.VITE_SOURCE_COMMIT,
  buildTime: import.meta.env.VITE_BUILD_TIME,
  artifactIdentity: import.meta.env.VITE_ARTIFACT_IDENTITY,
});

export function App() {
  const [session, setSession] = useState<ActiveSession>();
  const [loading, setLoading] = useState(true);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [bootstrapTokenRequired, setBootstrapTokenRequired] = useState(false);
  const [offline, setOffline] = useState(desktopStandalone ? false : !navigator.onLine);
  const [page, setPage] = useState<Page>('dashboard');
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">ApiaryLens</span>
          <button className="account-link" onClick={() => setPage('version')}>
            {session.organization.name}
          </button>
        </div>
        <div className="top-actions">
          <span className={`connectivity ${offline ? 'offline' : ''}`}>
            {offline ? 'Offline' : 'Online'}
          </span>
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

      <main className="content">
        {page === 'dashboard' && (
          <Dashboard organizationId={session.organization.id} onNavigate={setPage} />
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
          />
        )}
        {page === 'inspections' && (
          <Inspections
            organizationId={session.organization.id}
            onNotice={setNotice}
            canWrite={session.membership.role !== 'viewer'}
          />
        )}
        {page === 'care' && (
          <CareRecords
            organizationId={session.organization.id}
            onNotice={setNotice}
            canWrite={session.membership.role !== 'viewer'}
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
            onClick={() => setPage(target)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function AuthScreen({
  bootstrapAvailable,
  bootstrapTokenRequired,
  offline,
  onAuthenticated,
}: {
  bootstrapAvailable: boolean;
  bootstrapTokenRequired: boolean;
  offline: boolean;
  onAuthenticated: (session: SessionView | BootstrapSession) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const invitationToken = new URLSearchParams(location.search).get('invite');
  const [recovering, setRecovering] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      if (recovering) {
        await api.recover(
          String(form.get('identifier')),
          String(form.get('recoveryCode')),
          String(form.get('password')),
        );
        setRecovering(false);
        setError('Password updated. Sign in with your new password.');
        return;
      }
      const session = invitationToken
        ? await api.acceptInvitation(invitationToken, String(form.get('password')))
        : bootstrapAvailable
          ? await api.bootstrap({
              identifier: String(form.get('identifier')),
              displayName: String(form.get('displayName')),
              password: String(form.get('password')),
              organizationName: String(form.get('organizationName')),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              ...(bootstrapTokenRequired
                ? { bootstrapToken: String(form.get('bootstrapToken')) }
                : {}),
            })
          : await api.signIn(String(form.get('identifier')), String(form.get('password')));
      await onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to continue');
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <span className="eyebrow">ApiaryLens</span>
        <h1>Your hive history, even beyond the signal.</h1>
        <p>
          Private, family-friendly apiary records that work in the yard and synchronize at home.
        </p>
      </section>
      <form className="card form" onSubmit={(event) => void submit(event)}>
        <h2>
          {invitationToken
            ? 'Join your family apiary'
            : recovering
              ? 'Recover your account'
              : bootstrapAvailable
                ? 'Create your family apiary'
                : 'Welcome back'}
        </h2>
        {offline && <p className="error">Connect once to sign in on this device.</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {bootstrapAvailable && !invitationToken && !recovering && (
          <>
            <label>
              Display name
              <input name="displayName" required maxLength={120} autoComplete="name" />
            </label>
            <label>
              Family or apiary name
              <input name="organizationName" required maxLength={120} />
            </label>
            {bootstrapTokenRequired && (
              <label>
                Deployment bootstrap code
                <input name="bootstrapToken" required minLength={20} autoComplete="off" />
                <small>Scout Bee displays this one-time code after deployment.</small>
              </label>
            )}
          </>
        )}
        {!invitationToken && (
          <label>
            Email or username
            <input name="identifier" required minLength={3} autoComplete="username" />
          </label>
        )}
        {recovering && (
          <label>
            Unused recovery code
            <input name="recoveryCode" required minLength={16} autoComplete="off" />
          </label>
        )}
        <label>
          {invitationToken ? 'Create your password' : recovering ? 'New password' : 'Password'}
          <input
            name="password"
            required
            minLength={12}
            type="password"
            autoComplete={
              bootstrapAvailable || invitationToken ? 'new-password' : 'current-password'
            }
          />
          {invitationToken && (
            <small>
              Choose a new password for your ApiaryLens account. Use at least 12 characters.
            </small>
          )}
        </label>
        <button className="button primary" disabled={working || offline}>
          {working
            ? 'Working…'
            : recovering
              ? 'Set new password'
              : invitationToken
                ? 'Accept invitation'
                : bootstrapAvailable
                  ? 'Create secure workspace'
                  : 'Sign in'}
        </button>
        {!bootstrapAvailable && !invitationToken && (
          <button type="button" className="text-button" onClick={() => setRecovering(!recovering)}>
            {recovering ? 'Return to sign in' : 'Use a recovery code'}
          </button>
        )}
      </form>
    </main>
  );
}

function RecoveryCodes({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  function save() {
    const content = `ApiaryLens recovery codes\n\n${codes.join('\n')}\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    link.download = 'apiarylens-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(link.href);
    onSaved();
  }
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
    >
      <section className="card recovery-dialog">
        <span className="eyebrow">One-time setup</span>
        <h2 id="recovery-title">Save your recovery codes</h2>
        <p>
          These codes are shown only once. Store them somewhere private; each code can recover your
          account one time without an email service.
        </p>
        <ol className="recovery-list">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
        <button className="button primary" onClick={save}>
          Download codes and continue
        </button>
      </section>
    </div>
  );
}

function useResources(organizationId: string, entityType: LocalResource['entityType']) {
  return useLiveQuery(
    () =>
      db.resources
        .where('[organizationId+entityType]')
        .equals([organizationId, entityType])
        .toArray(),
    [organizationId, entityType],
    [],
  );
}

function Dashboard({
  organizationId,
  onNavigate,
}: {
  organizationId: string;
  onNavigate: (page: Page) => void;
}) {
  const apiaries = useResources(organizationId, 'apiary');
  const hives = useResources(organizationId, 'hive');
  const inspections = useResources(organizationId, 'inspection');
  const followUps = useResources(organizationId, 'followUp');
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  const openFollowUps = followUps.filter((item) => !item.data.completedAt);
  const latestByHive = new Map<string, LocalResource>();
  for (const inspection of [...inspections].sort((a, b) =>
    String(b.data.inspectedAt).localeCompare(String(a.data.inspectedAt)),
  )) {
    const hiveId = String(inspection.data.hiveId);
    if (!latestByHive.has(hiveId)) latestByHive.set(hiveId, inspection);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Today</span>
          <h1>Apiary overview</h1>
        </div>
      </div>
      <section className="metric-grid" aria-label="Apiary summary">
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate('hives')}
          aria-label="View active hives"
        >
          <strong>{hives.filter((hive) => hive.data.status === 'active').length}</strong>
          <span>Active hives</span>
        </button>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate('apiaries')}
          aria-label="View apiaries"
        >
          <strong>{apiaries.length}</strong>
          <span>Apiaries</span>
        </button>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate('care')}
          aria-label="View open follow-ups"
        >
          <strong>{openFollowUps.length}</strong>
          <span>Open follow-ups</span>
        </button>
        <article className="metric pending">
          <strong>{pending}</strong>
          <span>Pending sync</span>
        </article>
      </section>
      <section className="card">
        <h2>Latest inspection by hive</h2>
        {hives.length === 0 ? (
          <Empty text="Add your first hive to begin its history." />
        ) : (
          <ul className="dashboard-list">
            {hives
              .filter((hive) => hive.data.status !== 'archived')
              .map((hive) => {
                const inspection = latestByHive.get(hive.id);
                return (
                  <li key={hive.id}>
                    <strong>{String(hive.data.name)}</strong>
                    <span>
                      {inspection
                        ? `${new Date(String(inspection.data.inspectedAt)).toLocaleString()} · ${String(inspection.data.state)}`
                        : 'No inspection recorded yet'}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
      <section className="card dashboard-followups">
        <h2>Follow-up work</h2>
        {openFollowUps.length === 0 ? (
          <Empty text="No open follow-up items." />
        ) : (
          <ul className="dashboard-list">
            {openFollowUps
              .sort((a, b) =>
                String(a.data.dueDate ?? '9999').localeCompare(String(b.data.dueDate ?? '9999')),
              )
              .map((item) => (
                <li key={item.key}>
                  <strong>{String(item.data.description)}</strong>
                  <span>
                    {item.data.dueDate
                      ? `Due ${new Date(`${item.data.dueDate}T12:00:00`).toLocaleDateString()}`
                      : 'No due date'}{' '}
                    · {item.syncState}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Apiaries({ organizationId, onNotice, canWrite = true }: FormProps) {
  const records = useResources(organizationId, 'apiary');
  const [editing, setEditing] = useState<LocalResource>();
  const update = async (record: LocalResource, archive?: boolean) => {
    if (archive !== undefined) {
      await queueUpdate(record, { archivedAt: archive ? new Date().toISOString() : null });
      onNotice(archive ? 'Apiary archived.' : 'Apiary restored.');
      return;
    }
    setEditing(record);
  };
  return (
    <>
      <ResourcePage
        title="Apiaries"
        description="Locations where your colonies live."
        records={records}
        {...(canWrite
          ? {
              onEdit: (record: LocalResource) => void update(record),
              onArchive: (record: LocalResource, archive: boolean) => void update(record, archive),
            }
          : {})}
        form={
          canWrite ? (
            <QuickForm
              submitLabel="Add apiary"
              fields={[
                ['name', 'Apiary name', true],
                ['location', 'Location', false],
                ['accessNotes', 'Access notes', false],
                ['notes', 'Notes', false],
              ]}
              onSubmit={async (fields) => {
                await queueCreate(organizationId, 'apiary', fields);
                onNotice('Apiary saved on this device and queued for sync.');
              }}
            />
          ) : (
            <Empty text="Viewer access is read-only." />
          )
        }
      />
      {editing && (
        <RecordEditor
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            onNotice('Apiary changes saved offline.');
          }}
        />
      )}
    </>
  );
}

function Hives({ organizationId, onNotice, canWrite = true }: FormProps) {
  const records = useResources(organizationId, 'hive');
  const [editing, setEditing] = useState<LocalResource>();
  const apiaries = useResources(organizationId, 'apiary');
  const form = !canWrite ? (
    <Empty text="Viewer access is read-only." />
  ) : apiaries.length === 0 ? (
    <Empty text="Add an apiary before adding its first hive." />
  ) : (
    <QuickForm
      submitLabel="Add hive"
      fields={[
        ['name', 'Hive name or number', true],
        ['installDate', 'Install date (YYYY-MM-DD)', false],
        ['origin', 'Origin', false],
        ['notes', 'Notes', false],
      ]}
      select={{
        name: 'apiaryId',
        label: 'Apiary',
        options: apiaries.map((item) => [item.id, String(item.data.name)]),
      }}
      onSubmit={async (fields) => {
        await queueCreate(organizationId, 'hive', {
          ...fields,
          installDate: fields.installDate || null,
          status: 'active',
        });
        onNotice('Hive saved on this device and queued for sync.');
      }}
    />
  );
  const queens = useResources(organizationId, 'queen');
  const equipment = useResources(organizationId, 'equipmentBox');
  const inspections = useResources(organizationId, 'inspection');
  const miteCounts = useResources(organizationId, 'miteCount');
  const observations = useResources(organizationId, 'healthObservation');
  const feedings = useResources(organizationId, 'feedingEvent');
  const treatments = useResources(organizationId, 'treatmentEvent');
  const harvests = useResources(organizationId, 'harvest');
  const followUps = useResources(organizationId, 'followUp');
  const history = useMemo(
    () =>
      [
        ...inspections,
        ...queens,
        ...equipment,
        ...miteCounts,
        ...observations,
        ...feedings,
        ...treatments,
        ...harvests,
        ...followUps,
      ].sort((a, b) => historyDate(b).localeCompare(historyDate(a))),
    [
      inspections,
      queens,
      equipment,
      miteCounts,
      observations,
      feedings,
      treatments,
      harvests,
      followUps,
    ],
  );
  return (
    <>
      <ResourcePage
        title="Hives"
        description="Colonies and their current status."
        records={records}
        form={form}
        {...(canWrite
          ? {
              onEdit: (record: LocalResource) => setEditing(record),
              onArchive: (record: LocalResource, archive: boolean) =>
                void queueUpdate(record, {
                  archivedAt: archive ? new Date().toISOString() : null,
                  status: archive ? 'archived' : 'active',
                }).then(() => onNotice(archive ? 'Hive archived.' : 'Hive restored.')),
            }
          : {})}
      />
      {records.length > 0 && canWrite && (
        <div className="two-column management-grid">
          <section className="card">
            <h2>Queen history</h2>
            <QueenForm
              hives={records}
              onSubmit={async (fields) => {
                for (const current of queens.filter(
                  (queen) => queen.data.hiveId === fields.hiveId && queen.data.status === 'current',
                )) {
                  await queueUpdate(current, { status: 'superseded' });
                }
                await queueCreate(organizationId, 'queen', {
                  ...fields,
                  marked: fields.marked,
                  year: fields.year,
                  introductionDate: fields.introductionDate || null,
                  status: 'current',
                });
                onNotice('Queen history saved offline.');
              }}
            />
            <RecordList records={queens} titleField="identifier" />
          </section>
          <section className="card">
            <h2>Equipment stack</h2>
            <EquipmentStackBuilder
              organizationId={organizationId}
              hives={records}
              equipment={equipment}
              onNotice={onNotice}
            />
          </section>
        </div>
      )}
      {records.length > 0 && <HiveTimeline records={history} hives={records} />}
      {editing && (
        <RecordEditor
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            onNotice('Hive changes saved offline.');
          }}
        />
      )}
    </>
  );
}

function EquipmentStackBuilder({
  organizationId,
  hives,
  equipment,
  onNotice,
}: {
  organizationId: string;
  hives: LocalResource[];
  equipment: LocalResource[];
  onNotice: (message: string) => void;
}) {
  const [hiveId, setHiveId] = useState(hives[0]?.id ?? '');
  const [componentType, setComponentType] = useState<EquipmentType>('deep');
  const [componentPurpose, setComponentPurpose] = useState('');
  const [error, setError] = useState('');
  const active = activeEquipmentForHive(equipment, hiveId);
  const history = equipment.filter(
    (item) => item.data.hiveId === hiveId && item.data.status !== 'active',
  );

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const position = nextEquipmentPosition(equipment, hiveId);
    setError('');
    try {
      if (position > 20) throw new Error('A hive stack can contain up to 20 active components.');
      await queueCreate(organizationId, 'equipmentBox', {
        hiveId,
        boxType: componentType,
        customType: componentType === 'other' ? values.customType || null : null,
        purpose: values.purpose || null,
        customPurpose: values.purpose === 'other' ? values.customPurpose || null : null,
        position,
        frameCount: isFrameBox(componentType) ? Number(values.frameCount) : null,
        status: 'active',
        installedAt: values.installedAt || null,
        removedAt: null,
        notes: values.notes || null,
      });
      form.reset();
      setComponentType('deep');
      setComponentPurpose('');
      onNotice('Hive component added and queued for synchronization.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add the component.');
    }
  }

  async function move(item: LocalResource, direction: -1 | 1) {
    const adjacent = adjacentEquipment(equipment, item, direction);
    if (!adjacent) return;
    const position = Number(item.data.position);
    await queueUpdate(item, { position: Number(adjacent.data.position) });
    await queueUpdate(adjacent, { position });
    onNotice('Hive stack order updated.');
  }

  return (
    <div className="equipment-builder">
      <label className="equipment-hive-select">
        Hive
        <select value={hiveId} onChange={(event) => setHiveId(event.currentTarget.value)}>
          {hives.map((hive) => (
            <option key={hive.id} value={hive.id}>
              {String(hive.data.name)}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">Shown bottom to top, matching the physical hive.</p>
      {active.length === 0 ? (
        <Empty text="No equipment recorded for this hive." />
      ) : (
        <ol className="equipment-stack" aria-label="Hive equipment, bottom to top">
          {active.map((item, index) => {
            const type = String(item.data.boxType) as EquipmentType;
            const typeLabel = equipmentTypeLabel(item.data);
            return (
              <li className={`equipment-component component-${type}`} key={item.key}>
                <div>
                  <strong>{typeLabel}</strong>
                  <span>
                    {equipmentPurposeLabel(item.data)}
                    {item.data.frameCount ? ` · ${item.data.frameCount} frames` : ''}
                  </span>
                  {item.data.installedAt ? (
                    <span>Installed {String(item.data.installedAt)}</span>
                  ) : null}
                  {item.data.notes ? <span>{String(item.data.notes)}</span> : null}
                </div>
                <div className="record-actions" aria-label={`Actions for ${typeLabel}`}>
                  <button
                    className="text-button"
                    disabled={index === 0}
                    onClick={() => void move(item, -1)}
                    aria-label="Move toward bottom"
                  >
                    Down
                  </button>
                  <button
                    className="text-button"
                    disabled={index === active.length - 1}
                    onClick={() => void move(item, 1)}
                    aria-label="Move toward top"
                  >
                    Up
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      void queueUpdate(item, {
                        status: 'removed',
                        removedAt: new Date().toISOString(),
                      }).then(() =>
                        onNotice('Component removed from the active stack; history retained.'),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <form className="form compact equipment-form" onSubmit={(event) => void add(event)}>
        <h3>Add a component</h3>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label>
          Component type
          <select
            value={componentType}
            onChange={(event) => setComponentType(event.currentTarget.value as EquipmentType)}
          >
            {Object.entries(equipmentTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {componentType === 'other' && (
          <label>
            Custom component type
            <input name="customType" required maxLength={120} />
          </label>
        )}
        <label>
          Purpose
          <select
            name="purpose"
            value={componentPurpose}
            onChange={(event) => setComponentPurpose(event.currentTarget.value)}
          >
            <option value="">Not recorded</option>
            {Object.entries(equipmentPurposeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {componentPurpose === 'other' && (
          <label>
            Custom purpose
            <input name="customPurpose" required maxLength={120} />
          </label>
        )}
        {isFrameBox(componentType) && (
          <label>
            Frame count
            <input name="frameCount" type="number" min="1" max="24" defaultValue="10" required />
          </label>
        )}
        <label>
          Installed date
          <input name="installedAt" type="date" />
        </label>
        <label>
          Notes
          <textarea name="notes" rows={2} />
        </label>
        <button className="button primary">Add to top</button>
      </form>
      {history.length > 0 && (
        <details className="equipment-history">
          <summary>Removed and stored equipment ({history.length})</summary>
          <ul className="record-list">
            {history.map((item) => (
              <li key={item.key}>
                <strong>{equipmentTypeLabel(item.data)}</strong>
                <span>{equipmentPurposeLabel(item.data)}</span>
                <span>
                  {String(item.data.status)}
                  {item.data.removedAt
                    ? ` · removed ${new Date(String(item.data.removedAt)).toLocaleString()}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RecordEditor({
  record,
  onClose,
  onSaved,
}: {
  record: LocalResource;
  onClose: () => void;
  onSaved: () => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<
      string,
      string
    >;
    const payload =
      record.entityType === 'apiary'
        ? {
            name: values.name,
            location: values.location,
            accessNotes: values.accessNotes,
            notes: values.notes,
          }
        : {
            name: values.name,
            status: values.status,
            installDate: values.installDate || null,
            origin: values.origin,
            notes: values.notes,
          };
    await queueUpdate(record, payload);
    onSaved();
  }
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-editor-title"
    >
      <form className="card form record-editor" onSubmit={(event) => void submit(event)}>
        <h2 id="record-editor-title">Edit {record.entityType}</h2>
        <label>
          Name
          <input name="name" required defaultValue={String(record.data.name)} />
        </label>
        {record.entityType === 'apiary' ? (
          <>
            <label>
              Location
              <input name="location" defaultValue={String(record.data.location ?? '')} />
            </label>
            <label>
              Access notes
              <textarea
                name="accessNotes"
                rows={3}
                defaultValue={String(record.data.accessNotes ?? '')}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Status
              <select name="status" defaultValue={String(record.data.status)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="lost">Lost</option>
                <option value="sold">Sold</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              Install date
              <input
                name="installDate"
                type="date"
                defaultValue={String(record.data.installDate ?? '')}
              />
            </label>
            <label>
              Origin
              <input name="origin" defaultValue={String(record.data.origin ?? '')} />
            </label>
          </>
        )}
        <label>
          Notes
          <textarea name="notes" rows={4} defaultValue={String(record.data.notes ?? '')} />
        </label>
        <div className="button-row">
          <button className="button primary">Save changes</button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function HiveTimeline({ records, hives }: { records: LocalResource[]; hives: LocalResource[] }) {
  const hiveNames = new Map(hives.map((hive) => [hive.id, String(hive.data.name)]));
  return (
    <section className="card hive-timeline">
      <h2>Hive timeline</h2>
      {records.length === 0 ? (
        <Empty text="Inspections and management events will appear here in chronological order." />
      ) : (
        <ol>
          {records.map((record) => (
            <li key={record.key}>
              <time>{new Date(historyDate(record)).toLocaleString()}</time>
              <div>
                <strong>
                  {hiveNames.get(String(record.data.hiveId)) ?? 'Hive'} · {timelineLabel(record)}
                </strong>
                <p>
                  {String(
                    record.data.notes || record.data.description || record.data.followUpNotes || '',
                  )}
                </p>
              </div>
              <SyncBadge state={record.syncState} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function historyDate(record: LocalResource) {
  for (const field of [
    'inspectedAt',
    'measuredAt',
    'observedAt',
    'fedAt',
    'applicationDate',
    'harvestedAt',
    'introductionDate',
    'updatedAt',
  ]) {
    if (record.data[field]) return String(record.data[field]);
  }
  return record.updatedAt;
}

function timelineLabel(record: LocalResource) {
  return (
    (
      {
        inspection: `Inspection · ${record.data.state}`,
        queen: `Queen · ${record.data.identifier}`,
        equipmentBox: `Equipment · ${record.data.boxType}`,
        miteCount: `Mite count · ${record.data.miteCount}`,
        healthObservation: `Observation · ${record.data.category}`,
        feedingEvent: `Feeding · ${record.data.feedType}`,
        treatmentEvent: `Treatment · ${record.data.productOrMethod}`,
        harvest: `Harvest · ${record.data.quantity} ${record.data.unit}`,
        followUp: `Follow-up · ${record.data.completedAt ? 'complete' : 'open'}`,
      } as Record<string, string>
    )[record.entityType] ?? record.entityType
  );
}

function Inspections({ organizationId, onNotice, canWrite = true }: FormProps) {
  const records = useResources(organizationId, 'inspection');
  const hives = useResources(organizationId, 'hive');
  const [editing, setEditing] = useState<LocalResource>();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Inspections</h1>
          <p>Start in the yard, save a draft, add photos, and complete the review later.</p>
        </div>
      </div>
      <div className="inspection-layout">
        <section className="card">
          <h2>{editing ? 'Edit inspection' : 'Start an inspection'}</h2>
          {!canWrite ? (
            <Empty text="Viewer access is read-only." />
          ) : hives.length === 0 ? (
            <Empty text="Add a hive before recording an inspection." />
          ) : (
            <InspectionForm
              organizationId={organizationId}
              hives={hives}
              editing={editing}
              onCancel={() => setEditing(undefined)}
              onSaved={(message) => {
                setEditing(undefined);
                onNotice(message);
              }}
            />
          )}
        </section>
        <section className="card">
          <h2>Inspection history</h2>
          {records.length === 0 ? (
            <Empty text="No inspections yet." />
          ) : (
            <InspectionHistory
              records={records}
              hives={hives}
              {...(canWrite ? { onEdit: setEditing } : {})}
            />
          )}
        </section>
      </div>
      <MediaGallery
        organizationId={organizationId}
        inspections={records}
        onNotice={onNotice}
        canWrite={canWrite}
      />
    </>
  );
}

function InspectionForm({
  organizationId,
  hives,
  editing,
  onCancel,
  onSaved,
}: {
  organizationId: string;
  hives: LocalResource[];
  editing: LocalResource | undefined;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    const form = event.currentTarget;
    const values = new FormData(form);
    const files = Array.from((form.elements.namedItem('photos') as HTMLInputElement).files ?? []);
    const observed = (name: string) =>
      values.get(name) === '' ? null : values.get(name) === 'yes';
    const inspectedAt = new Date(String(values.get('inspectedAt'))).toISOString();
    const weather = readManualWeatherSnapshot(values, inspectedAt);
    const payload = {
      hiveId: String(values.get('hiveId')),
      inspectedAt,
      inspectorName: String(values.get('inspectorName')),
      state: String(values.get('state')),
      notes: String(values.get('notes') ?? ''),
      temperament: String(values.get('temperament')),
      populationStrength: String(values.get('populationStrength')),
      queenSeen: observed('queenSeen'),
      eggsOrLarvae: observed('eggsOrLarvae'),
      broodCondition: String(values.get('broodCondition') ?? ''),
      stores: String(values.get('stores') ?? ''),
      followUpNotes: String(values.get('followUpNotes') ?? ''),
      weather,
    };
    try {
      let inspectionId: string;
      if (editing) {
        await queueUpdate(editing, payload);
        inspectionId = editing.id;
      } else {
        inspectionId = await queueCreate(organizationId, 'inspection', payload);
        if (payload.followUpNotes.trim()) {
          await queueCreate(organizationId, 'followUp', {
            hiveId: payload.hiveId,
            inspectionId,
            description: payload.followUpNotes,
          });
        }
      }
      for (const file of files)
        await stageImage(organizationId, payload.hiveId, inspectionId, file);
      form.reset();
      onSaved(
        payload.state === 'complete'
          ? 'Inspection completed and saved offline.'
          : 'Inspection draft saved offline.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the inspection');
    } finally {
      setWorking(false);
    }
  }
  const data = editing?.data;
  return (
    <form
      className="form inspection-form"
      key={editing?.key ?? 'new'}
      onSubmit={(event) => void submit(event)}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-grid">
        <label>
          Hive
          <select name="hiveId" required defaultValue={String(data?.hiveId ?? hives[0]?.id)}>
            {hives.map((hive) => (
              <option key={hive.id} value={hive.id}>
                {String(hive.data.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date and time
          <input
            name="inspectedAt"
            type="datetime-local"
            required
            defaultValue={toLocalDateTime(String(data?.inspectedAt ?? new Date().toISOString()))}
          />
        </label>
        <label>
          Inspector
          <input name="inspectorName" required defaultValue={String(data?.inspectorName ?? '')} />
        </label>
        <label>
          Progress
          <select name="state" defaultValue={String(data?.state ?? 'draft')}>
            <option value="draft">Draft — finish later</option>
            <option value="complete">Complete</option>
          </select>
        </label>
        <label>
          Temperament
          <select name="temperament" defaultValue={String(data?.temperament ?? 'not_observed')}>
            <option value="not_observed">Not observed</option>
            <option value="calm">Calm</option>
            <option value="normal">Normal</option>
            <option value="defensive">Defensive</option>
          </select>
        </label>
        <label>
          Population
          <select
            name="populationStrength"
            defaultValue={String(data?.populationStrength ?? 'not_observed')}
          >
            <option value="not_observed">Not observed</option>
            <option value="weak">Weak</option>
            <option value="moderate">Moderate</option>
            <option value="strong">Strong</option>
          </select>
        </label>
        <ObservedField name="queenSeen" label="Queen seen" value={data?.queenSeen} />
        <ObservedField
          name="eggsOrLarvae"
          label="Eggs or larvae present"
          value={data?.eggsOrLarvae}
        />
      </div>
      <label>
        Brood condition
        <input
          name="broodCondition"
          list="inspection-brood-options"
          defaultValue={String(data?.broodCondition ?? '')}
        />
        <datalist id="inspection-brood-options">
          {fieldChoices.broodCondition.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </label>
      <label>
        Stores
        <input
          name="stores"
          list="inspection-stores-options"
          defaultValue={String(data?.stores ?? '')}
        />
        <datalist id="inspection-stores-options">
          {fieldChoices.stores.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </label>
      <label>
        Inspection notes
        <textarea name="notes" rows={4} defaultValue={String(data?.notes ?? '')} />
      </label>
      <label>
        Follow-up notes
        <textarea name="followUpNotes" rows={3} defaultValue={String(data?.followUpNotes ?? '')} />
      </label>
      <fieldset>
        <legend>Optional manual weather snapshot</legend>
        <p className="field-hint">
          Works without a connection and does not share your location with a weather provider.
        </p>
        <div className="form-grid">
          <label>
            Temperature
            <input
              name="temperature"
              type="number"
              step="any"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).temperature ?? '')
                  : ''
              }
            />
          </label>
          <label>
            Unit
            <select
              name="temperatureUnit"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).temperatureUnit ?? 'f')
                  : 'f'
              }
            >
              <option value="f">°F</option>
              <option value="c">°C</option>
            </select>
          </label>
          <label>
            Conditions
            <input
              name="conditions"
              list="weather-condition-options"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).conditions ?? '')
                  : ''
              }
            />
            <datalist id="weather-condition-options">
              <option value="Clear" />
              <option value="Partly cloudy" />
              <option value="Overcast" />
              <option value="Light rain" />
              <option value="Rain" />
              <option value="Thunderstorms" />
              <option value="Fog" />
              <option value="Smoke or haze" />
            </datalist>
          </label>
          <label>
            Relative humidity (%)
            <input
              name="humidity"
              type="number"
              min="0"
              max="100"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).humidity ?? '')
                  : ''
              }
            />
          </label>
          <label>
            Wind speed
            <input
              name="windSpeed"
              type="number"
              min="0"
              max="300"
              step="any"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).windSpeed ?? '')
                  : ''
              }
            />
          </label>
          <label>
            Wind unit
            <select
              name="windSpeedUnit"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).windSpeedUnit ?? 'mph')
                  : 'mph'
              }
            >
              <option value="mph">mph</option>
              <option value="kph">km/h</option>
            </select>
          </label>
          <label>
            Wind direction
            <select
              name="windDirection"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).windDirection ?? '')
                  : ''
              }
            >
              <option value="">Not recorded</option>
              <option value="calm">Calm</option>
              <option value="n">North</option>
              <option value="ne">Northeast</option>
              <option value="e">East</option>
              <option value="se">Southeast</option>
              <option value="s">South</option>
              <option value="sw">Southwest</option>
              <option value="w">West</option>
              <option value="nw">Northwest</option>
              <option value="variable">Variable</option>
            </select>
          </label>
        </div>
      </fieldset>
      <label>
        Inspection photos
        <input
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          capture="environment"
        />
        <span className="field-hint">
          Originals and thumbnails are staged immediately, even without a connection.
        </span>
      </label>
      <div className="button-row">
        <button className="button primary" disabled={working}>
          {working ? 'Saving…' : editing ? 'Save changes' : 'Save inspection'}
        </button>
        {editing && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel edit
          </button>
        )}
      </div>
    </form>
  );
}

function ObservedField({ name, label, value }: { name: string; label: string; value: unknown }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value === true ? 'yes' : value === false ? 'no' : ''}>
        <option value="">Not recorded</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

function InspectionHistory({
  records,
  hives,
  onEdit,
}: {
  records: LocalResource[];
  hives: LocalResource[];
  onEdit?: (record: LocalResource) => void;
}) {
  const hiveNames = new Map(hives.map((hive) => [hive.id, String(hive.data.name)]));
  return (
    <div className="history-list">
      {[...records]
        .sort((a, b) => String(b.data.inspectedAt).localeCompare(String(a.data.inspectedAt)))
        .map((record) => (
          <details key={record.key}>
            <summary>
              <span>
                <strong>{hiveNames.get(String(record.data.hiveId)) ?? 'Hive'}</strong>
                <small>
                  {new Date(String(record.data.inspectedAt)).toLocaleString()} ·{' '}
                  {String(record.data.state)}
                </small>
              </span>
              <SyncBadge state={record.syncState} />
            </summary>
            <dl className="inspection-summary">
              <dt>Inspector</dt>
              <dd>{String(record.data.inspectorName)}</dd>
              <dt>Temperament</dt>
              <dd>{String(record.data.temperament).replaceAll('_', ' ')}</dd>
              <dt>Population</dt>
              <dd>{String(record.data.populationStrength).replaceAll('_', ' ')}</dd>
              <dt>Queen seen</dt>
              <dd>{yesNo(record.data.queenSeen)}</dd>
              <dt>Eggs or larvae</dt>
              <dd>{yesNo(record.data.eggsOrLarvae)}</dd>
              <dt>Brood</dt>
              <dd>{String(record.data.broodCondition || 'Not recorded')}</dd>
              <dt>Stores</dt>
              <dd>{String(record.data.stores || 'Not recorded')}</dd>
              <dt>Weather</dt>
              <dd>{formatWeatherSummary(record.data.weather)}</dd>
              <dt>Notes</dt>
              <dd>{String(record.data.notes || 'None')}</dd>
            </dl>
            {onEdit && (
              <button className="button secondary" onClick={() => onEdit(record)}>
                Edit inspection
              </button>
            )}
          </details>
        ))}
    </div>
  );
}

function MediaGallery({
  organizationId,
  inspections,
  onNotice,
  canWrite,
}: {
  organizationId: string;
  inspections: LocalResource[];
  onNotice: (message: string) => void;
  canWrite: boolean;
}) {
  const media = useResources(organizationId, 'mediaAsset').filter(
    (record) => !record.deletedAt && record.data.state !== 'deleted',
  );
  const inspectionNames = new Map(
    inspections.map((inspection) => [
      inspection.id,
      new Date(String(inspection.data.inspectedAt)).toLocaleString(),
    ]),
  );
  if (media.length === 0) return null;
  return (
    <section className="card media-section">
      <h2>Inspection photos</h2>
      <div className="media-grid">
        {media.map((record) => (
          <MediaTile
            key={record.key}
            record={record}
            inspectionLabel={inspectionNames.get(String(record.data.inspectionId))}
            onNotice={onNotice}
            canWrite={canWrite}
          />
        ))}
      </div>
    </section>
  );
}

function MediaTile({
  record,
  inspectionLabel,
  onNotice,
  canWrite,
}: {
  record: LocalResource;
  inspectionLabel: string | undefined;
  onNotice: (message: string) => void;
  canWrite: boolean;
}) {
  const local = useLiveQuery(() => db.media.get(record.id), [record.id]);
  const [localUrls, setLocalUrls] = useState<{ original: string; thumbnail: string }>();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!local?.blob) return;
    const original = URL.createObjectURL(local.blob);
    const thumbnail = local.thumbnail ? URL.createObjectURL(local.thumbnail) : original;
    setLocalUrls({ original, thumbnail });
    return () => {
      URL.revokeObjectURL(original);
      if (thumbnail !== original) URL.revokeObjectURL(thumbnail);
    };
  }, [local]);
  const thumbnail = localUrls?.thumbnail ?? `/api/v1/media/${record.id}/content?variant=thumbnail`;
  const original = localUrls?.original ?? `/api/v1/media/${record.id}/content`;
  const hasLocalPhoto = Boolean(local?.blob);
  const mediaReady = String(record.data.state) === 'ready' || local?.state === 'ready';
  const mediaSyncState =
    local?.state === 'failed' ? 'failed' : !mediaReady ? 'pending' : record.syncState;
  return (
    <>
      <article className="media-card">
        {hasLocalPhoto || mediaReady ? (
          <button
            className="media-thumb-button"
            onClick={() => setViewerOpen(true)}
            aria-label="Open photo viewer"
          >
            <img
              src={thumbnail}
              alt={String(record.data.caption || `Inspection photo ${record.data.fileName}`)}
              loading="lazy"
            />
          </button>
        ) : (
          <div className="media-missing" role="img" aria-label="Photo upload pending">
            Photo upload pending
          </div>
        )}
        <div>
          <strong>{String(record.data.caption || record.data.fileName)}</strong>
          <small>
            {inspectionLabel ?? 'Inspection'} · {Math.round(Number(record.data.byteSize) / 1024)} KB
          </small>
          <SyncBadge state={mediaSyncState} />
          {!mediaReady && !hasLocalPhoto && (
            <small>
              Return to the device that captured this photo and reconnect. Upload retries
              automatically; Sync now remains available for recovery.
            </small>
          )}
          {canWrite && (
            <div className="record-actions">
              <button
                className="text-button"
                onClick={() => {
                  const caption = prompt('Photo caption', String(record.data.caption ?? ''));
                  if (caption !== null)
                    void queueUpdate(record, { caption }).then(() =>
                      onNotice('Photo caption saved offline.'),
                    );
                }}
              >
                Caption
              </button>
              {local?.state === 'failed' && (
                <button
                  className="text-button"
                  onClick={() =>
                    void db.media
                      .update(record.id, { state: 'staged', lastError: '' })
                      .then(() => onNotice('Photo queued to retry.'))
                  }
                >
                  Retry
                </button>
              )}
              <button
                className="text-button"
                onClick={() => {
                  if (
                    confirm(
                      'Remove this inspection photo? It will be deleted from synchronized devices.',
                    )
                  )
                    void queueDelete(record).then(() => onNotice('Photo removal queued for sync.'));
                }}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </article>
      {viewerOpen && (
        <div className="media-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer">
          <button
            className="media-viewer-backdrop"
            aria-label="Close photo viewer"
            onClick={() => setViewerOpen(false)}
          />
          <div className="media-viewer-panel">
            <header>
              <strong>{String(record.data.caption || record.data.fileName)}</strong>
              <div className="media-viewer-controls">
                <button onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((value) => Math.min(4, value + 0.25))}>+</button>
                <button onClick={() => setViewerOpen(false)}>Close</button>
              </div>
            </header>
            <div className="media-viewer-scroll">
              <img
                src={original}
                alt={String(record.data.caption || record.data.fileName)}
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function yesNo(value: unknown) {
  return value === true ? 'Yes' : value === false ? 'No' : 'Not recorded';
}

const careTypes = [
  'miteCount',
  'healthObservation',
  'feedingEvent',
  'treatmentEvent',
  'harvest',
  'followUp',
] as const;
type CareType = (typeof careTypes)[number];

function CareRecords({ organizationId, onNotice, canWrite = true }: FormProps) {
  const hives = useResources(organizationId, 'hive');
  const miteCounts = useResources(organizationId, 'miteCount');
  const observations = useResources(organizationId, 'healthObservation');
  const feedings = useResources(organizationId, 'feedingEvent');
  const treatments = useResources(organizationId, 'treatmentEvent');
  const harvests = useResources(organizationId, 'harvest');
  const followUps = useResources(organizationId, 'followUp');
  const records = useMemo(
    () =>
      [...miteCounts, ...observations, ...feedings, ...treatments, ...harvests, ...followUps].sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      ),
    [miteCounts, observations, feedings, treatments, harvests, followUps],
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Hive care</h1>
          <p>Health observations, feeding, treatment, harvest, mites, and follow-ups.</p>
        </div>
      </div>
      <div className="two-column">
        <section className="card">
          <h2>Record care</h2>
          {!canWrite ? (
            <Empty text="Viewer access is read-only." />
          ) : hives.length === 0 ? (
            <Empty text="Add a hive first." />
          ) : (
            <CareForm
              organizationId={organizationId}
              hives={hives}
              records={records}
              onNotice={onNotice}
            />
          )}
        </section>
        <section className="card">
          <h2>Care timeline</h2>
          {records.length === 0 ? (
            <Empty text="No care records yet." />
          ) : (
            <CareTimeline records={records} onNotice={onNotice} canWrite={canWrite} />
          )}
        </section>
      </div>
      <MiteTrend records={miteCounts} hives={hives} />
    </>
  );
}

function CareTimeline({
  records,
  onNotice,
  canWrite,
}: {
  records: LocalResource[];
  onNotice: (message: string) => void;
  canWrite: boolean;
}) {
  return (
    <ul className="record-list care-list">
      {records.map((record) => (
        <li key={record.key}>
          <div>
            <strong>{careRecordTitle(record)}</strong>
            <span>{new Date(record.updatedAt).toLocaleString()}</span>
            {Boolean(record.data.notes) && <small>{String(record.data.notes)}</small>}
          </div>
          <div className="record-actions">
            <SyncBadge state={record.syncState} />
            {canWrite && record.entityType === 'followUp' && !record.data.completedAt && (
              <button
                className="text-button"
                onClick={() =>
                  void queueUpdate(record, { completedAt: new Date().toISOString() }).then(() =>
                    onNotice('Follow-up marked complete.'),
                  )
                }
              >
                Complete
              </button>
            )}
            {canWrite && record.entityType === 'followUp' && Boolean(record.data.completedAt) && (
              <button
                className="text-button"
                onClick={() =>
                  void queueUpdate(record, { completedAt: null }).then(() =>
                    onNotice('Follow-up reopened.'),
                  )
                }
              >
                Reopen
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function careRecordTitle(record: LocalResource) {
  if (record.entityType === 'miteCount')
    return `${record.data.miteCount} mites · ${String(record.data.method).replaceAll('_', ' ')}`;
  if (record.entityType === 'healthObservation') return `Observation · ${record.data.category}`;
  if (record.entityType === 'feedingEvent') return `Feeding · ${record.data.feedType}`;
  if (record.entityType === 'treatmentEvent') return `Treatment · ${record.data.productOrMethod}`;
  if (record.entityType === 'harvest')
    return `Harvest · ${record.data.quantity} ${record.data.unit}`;
  return String(record.data.description ?? 'Follow-up');
}

function MiteTrend({ records, hives }: { records: LocalResource[]; hives: LocalResource[] }) {
  if (records.length === 0)
    return (
      <section className="card trend-card">
        <h2>Varroa trend</h2>
        <Empty text="Mite counts will form a chronological trend here." />
      </section>
    );
  const hiveNames = new Map(hives.map((hive) => [hive.id, String(hive.data.name)]));
  const points = [...records].sort((a, b) =>
    String(a.data.measuredAt).localeCompare(String(b.data.measuredAt)),
  );
  const max = Math.max(1, ...points.map((point) => Number(point.data.miteCount)));
  const coordinates = points
    .map(
      (point, index) =>
        `${points.length === 1 ? 50 : 5 + (index / (points.length - 1)) * 90},${92 - (Number(point.data.miteCount) / max) * 82}`,
    )
    .join(' ');
  return (
    <section className="card trend-card">
      <h2>Varroa trend</h2>
      <p>Recorded counts are observations, not an automated diagnosis.</p>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Mite counts over time, maximum ${max}`}
        preserveAspectRatio="none"
      >
        <line x1="5" y1="92" x2="95" y2="92" />
        <polyline points={coordinates} />
      </svg>
      <div className="trend-table" role="table" aria-label="Mite count history">
        {points.map((point) => (
          <div role="row" key={point.key}>
            <span role="cell">{new Date(String(point.data.measuredAt)).toLocaleDateString()}</span>
            <span role="cell">{hiveNames.get(String(point.data.hiveId)) ?? 'Hive'}</span>
            <strong role="cell">{String(point.data.miteCount)} mites</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function CareForm({
  organizationId,
  hives,
  records,
  onNotice,
}: FormProps & { hives: LocalResource[]; records: LocalResource[] }) {
  const [kind, setKind] = useState<CareType>('miteCount');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const timestamp = new Date().toISOString();
    try {
      const common = { hiveId: values.hiveId };
      const payloads: Record<CareType, Record<string, unknown>> = {
        miteCount: {
          ...common,
          measuredAt: timestamp,
          method: values.method,
          sampleSize: values.sampleSize ? Number(values.sampleSize) : null,
          miteCount: Number(values.miteCount),
          resultPercent: values.sampleSize
            ? (Number(values.miteCount) / Number(values.sampleSize)) * 100
            : null,
          notes: values.notes,
        },
        healthObservation: {
          ...common,
          observedAt: timestamp,
          category: values.category,
          severity: values.severity,
          notes: values.notes,
        },
        feedingEvent: {
          ...common,
          fedAt: timestamp,
          feedType: values.feedType,
          amount: values.amount ? Number(values.amount) : null,
          unit: values.unit,
          reason: values.reason,
          notes: values.notes,
        },
        treatmentEvent: {
          ...common,
          productOrMethod: values.productOrMethod,
          applicationDate: timestamp.slice(0, 10),
          removalDate: values.removalDate || null,
          dosageOrAmount: values.dosageOrAmount,
          restrictions: values.restrictions,
          notes: values.notes,
        },
        harvest: {
          ...common,
          harvestedAt: timestamp,
          quantity: Number(values.quantity),
          unit: values.unit,
          notes: values.notes,
        },
        followUp: { ...common, description: values.description, dueDate: values.dueDate || null },
      };
      await queueCreate(organizationId, kind, payloads[kind]);
      form.reset();
      onNotice('Care record saved offline and queued for sync.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save care record');
    }
  }
  return (
    <form className="form compact" onSubmit={(event) => void submit(event)}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label>
        Record type
        <select value={kind} onChange={(event) => setKind(event.target.value as CareType)}>
          {careTypes.map((type) => (
            <option key={type} value={type}>
              {careLabel(type)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Hive
        <select name="hiveId" required>
          {hives.map((hive) => (
            <option key={hive.id} value={hive.id}>
              {String(hive.data.name)}
            </option>
          ))}
        </select>
      </label>
      <CareFields kind={kind} records={records} />
      <label>
        Notes
        <textarea name="notes" rows={3} />
      </label>
      <button className="button primary">Save care record</button>
    </form>
  );
}

function SmartTextField({
  label,
  name,
  choices,
  recent = [],
  required = false,
  hint,
}: {
  label: string;
  name: string;
  choices: readonly string[];
  recent?: string[];
  required?: boolean;
  hint?: string;
}) {
  const options = mergeFieldChoices(recent, choices);
  return (
    <label>
      {label}
      <input name={name} list={`${name}-choices`} required={required} />
      <datalist id={`${name}-choices`}>
        {options.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <span className="field-hint">{hint ?? 'Choose a suggestion or type your own value.'}</span>
    </label>
  );
}

function CareFields({ kind, records }: { kind: CareType; records: LocalResource[] }) {
  if (kind === 'miteCount')
    return (
      <>
        <label>
          Method
          <select name="method">
            <option value="alcohol_wash">Alcohol wash</option>
            <option value="sugar_roll">Sugar roll</option>
            <option value="sticky_board">Sticky board</option>
            <option value="visual">Visual</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Sample size
          <input name="sampleSize" type="number" min="1" />
        </label>
        <label>
          Mite count
          <input name="miteCount" type="number" min="0" required />
        </label>
      </>
    );
  if (kind === 'healthObservation')
    return (
      <>
        <SmartTextField
          label="Observation"
          name="category"
          required
          choices={fieldChoices.category}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'healthObservation'),
            'category',
          )}
          hint="Choose a common concern or type the observation you saw. A diagnosis is not implied."
        />
        <label>
          Severity
          <select name="severity">
            <option value="unknown">Unknown</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </>
    );
  if (kind === 'feedingEvent')
    return (
      <>
        <SmartTextField
          label="Feed type"
          name="feedType"
          required
          choices={fieldChoices.feedType}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'feedingEvent'),
            'feedType',
          )}
        />
        <label>
          Amount
          <input name="amount" type="number" min="0" step="any" />
        </label>
        <SmartTextField
          label="Unit"
          name="unit"
          choices={fieldChoices.feedUnit}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'feedingEvent'),
            'unit',
          )}
        />
        <SmartTextField
          label="Reason"
          name="reason"
          choices={fieldChoices.feedReason}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'feedingEvent'),
            'reason',
          )}
        />
      </>
    );
  if (kind === 'treatmentEvent')
    return (
      <>
        <SmartTextField
          label="Product or method"
          name="productOrMethod"
          required
          choices={fieldChoices.treatment}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'treatmentEvent'),
            'productOrMethod',
          )}
          hint="Record the exact label or method used. Follow local law and the product label."
        />
        <label>
          Removal date
          <input name="removalDate" type="date" />
        </label>
        <SmartTextField
          label="Dosage or amount"
          name="dosageOrAmount"
          choices={[]}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'treatmentEvent'),
            'dosageOrAmount',
          )}
          hint="Enter the exact amount and unit from your treatment record."
        />
        <SmartTextField
          label="Restrictions"
          name="restrictions"
          choices={fieldChoices.restriction}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'treatmentEvent'),
            'restrictions',
          )}
          hint="Choose a reminder or enter the exact label restriction."
        />
      </>
    );
  if (kind === 'harvest')
    return (
      <>
        <label>
          Quantity
          <input name="quantity" type="number" min="0" step="any" required />
        </label>
        <SmartTextField
          label="Unit"
          name="unit"
          required
          choices={fieldChoices.harvestUnit}
          recent={recentFieldValues(
            records.filter((item) => item.entityType === 'harvest'),
            'unit',
          )}
        />
      </>
    );
  return (
    <>
      <SmartTextField
        label="Description"
        name="description"
        required
        choices={[]}
        recent={recentFieldValues(
          records.filter((item) => item.entityType === 'followUp'),
          'description',
        )}
      />
      <label>
        Due date
        <input name="dueDate" type="date" />
      </label>
    </>
  );
}

function careLabel(type: CareType) {
  return (
    {
      miteCount: 'Varroa mite count',
      healthObservation: 'Pest or health observation',
      feedingEvent: 'Feeding',
      treatmentEvent: 'Treatment',
      harvest: 'Honey harvest',
      followUp: 'Follow-up item',
    } as const
  )[type];
}

interface FormProps {
  organizationId: string;
  onNotice: (message: string) => void;
  canWrite?: boolean;
}

function ResourcePage({
  title,
  description,
  records,
  form,
  titleField = 'name',
  onEdit,
  onArchive,
}: {
  title: string;
  description: string;
  records: LocalResource[];
  form: React.ReactNode;
  titleField?: string;
  onEdit?: (record: LocalResource) => void;
  onArchive?: (record: LocalResource, archive: boolean) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="two-column">
        <section className="card">
          <h2>New</h2>
          {form}
        </section>
        <section className="card">
          <h2>Saved</h2>
          {records.length === 0 ? (
            <Empty text={`No ${title.toLowerCase()} yet.`} />
          ) : (
            <RecordList
              records={records}
              titleField={titleField}
              {...(onEdit ? { onEdit } : {})}
              {...(onArchive ? { onArchive } : {})}
            />
          )}
        </section>
      </div>
    </>
  );
}

function RecordList({
  records,
  titleField,
  onEdit,
  onArchive,
}: {
  records: LocalResource[];
  titleField: string;
  onEdit?: (record: LocalResource) => void;
  onArchive?: (record: LocalResource, archive: boolean) => void;
}) {
  return (
    <ul className="record-list">
      {records.map((record) => (
        <li key={record.key}>
          <div>
            <strong>{String(record.data[titleField] ?? record.entityType)}</strong>
            <span>{recordSummary(record) ?? new Date(record.updatedAt).toLocaleString()}</span>
          </div>
          <div className="record-actions">
            <SyncBadge state={record.syncState} />
            {onEdit && (
              <button className="text-button" onClick={() => onEdit(record)}>
                Edit
              </button>
            )}
            {onArchive && (
              <button
                className="text-button"
                onClick={() =>
                  onArchive(record, !(record.data.archivedAt || record.data.status === 'archived'))
                }
              >
                {record.data.archivedAt || record.data.status === 'archived'
                  ? 'Restore'
                  : 'Archive'}
              </button>
            )}
            {record.syncState === 'conflicted' && record.conflict && (
              <>
                <button
                  className="text-button"
                  onClick={() => void resolveConflict(record, 'server')}
                >
                  Use server
                </button>
                <button
                  className="text-button"
                  onClick={() => void resolveConflict(record, 'local')}
                >
                  Retry mine
                </button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function recordSummary(record: LocalResource): string | undefined {
  if (record.entityType === 'hive')
    return `${record.data.status} · ${record.data.origin || 'origin not recorded'}`;
  if (record.entityType === 'queen')
    return `${record.data.status} · ${record.data.marked ? `marked ${record.data.markColor || record.data.year || ''}` : 'unmarked'}${record.data.source ? ` · ${record.data.source}` : ''}`;
  if (record.entityType === 'equipmentBox')
    return `position ${record.data.position}${record.data.frameCount ? ` · ${record.data.frameCount} frames` : ''} · ${record.data.status}`;
  if (record.entityType === 'apiary')
    return String(
      record.data.location ||
        record.data.accessNotes ||
        new Date(record.updatedAt).toLocaleString(),
    );
  return undefined;
}

function SyncBadge({ state }: { state: LocalResource['syncState'] }) {
  return (
    <span className={`sync-badge ${state}`}>{state === 'pending' ? 'not synced' : state}</span>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

type Field = readonly [name: string, label: string, required: boolean];

function QueenForm({
  hives,
  onSubmit,
}: {
  hives: LocalResource[];
  onSubmit: (fields: {
    hiveId: string;
    identifier: string;
    marked: boolean;
    markColor: string | null;
    year: number | null;
    source: string | null;
    introductionDate: string;
    notes: string | null;
  }) => Promise<void>;
}) {
  const currentYear = new Date().getFullYear();
  const [markMode, setMarkMode] = useState<'year' | 'color' | 'unmarked'>('year');
  const [year, setYear] = useState(currentYear);
  const [color, setColor] = useState('white');
  const [identifierKind, setIdentifierKind] = useState<QueenIdentifierKind>('numbered_disc');
  const [sourceKind, setSourceKind] = useState('unknown');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const suggestedColor = queenColorForYear(year);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const chosenColor =
        markMode === 'year'
          ? suggestedColor
          : markMode === 'color'
            ? color === 'other'
              ? String(values.get('customMarkColor')).trim()
              : color
            : null;
      const source =
        sourceKind === 'other'
          ? String(values.get('customSource')).trim()
          : sourceKind === 'unknown'
            ? null
            : sourceKind.replaceAll('_', ' ');
      await onSubmit({
        hiveId: String(values.get('hiveId')),
        identifier: formatQueenIdentifier(identifierKind, String(values.get('identifierValue'))),
        marked: markMode !== 'unmarked',
        markColor: chosenColor || null,
        year: markMode === 'year' ? year : null,
        source: source || null,
        introductionDate: String(values.get('introductionDate')),
        notes: String(values.get('notes')).trim() || null,
      });
      form.reset();
      setMarkMode('year');
      setYear(currentYear);
      setColor('white');
      setIdentifierKind('numbered_disc');
      setSourceKind('unknown');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save queen');
    } finally {
      setWorking(false);
    }
  }

  return (
    <form className="form compact" onSubmit={(event) => void submit(event)}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label>
        Hive
        <select name="hiveId" required>
          {hives.map((hive) => (
            <option key={hive.id} value={hive.id}>
              {String(hive.data.name)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Identifier type
        <select
          value={identifierKind}
          onChange={(event) => setIdentifierKind(event.target.value as QueenIdentifierKind)}
        >
          <option value="numbered_disc">Numbered disc or tag</option>
          <option value="breeder_code">Breeder code</option>
          <option value="colony_name">Queen name</option>
          <option value="other">Other identifier</option>
        </select>
      </label>
      <label>
        {identifierKind === 'other' ? 'Other identifier' : 'Identifier value'}
        <input name="identifierValue" required maxLength={90} />
      </label>
      <fieldset>
        <legend>Mark recorded by</legend>
        <label>
          <input
            type="radio"
            name="markMode"
            value="year"
            checked={markMode === 'year'}
            onChange={() => setMarkMode('year')}
          />
          Year (suggest the standard color)
        </label>
        <label>
          <input
            type="radio"
            name="markMode"
            value="color"
            checked={markMode === 'color'}
            onChange={() => setMarkMode('color')}
          />
          Color
        </label>
        <label>
          <input
            type="radio"
            name="markMode"
            value="unmarked"
            checked={markMode === 'unmarked'}
            onChange={() => setMarkMode('unmarked')}
          />
          Unmarked
        </label>
      </fieldset>
      {markMode === 'year' && (
        <label>
          Queen year
          <input
            name="year"
            type="number"
            min="1900"
            max="2200"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            required
          />
          <span className="field-hint">
            International marking color for {year}: {suggestedColor}
          </span>
        </label>
      )}
      {markMode === 'color' && (
        <>
          <label>
            Mark color
            <select value={color} onChange={(event) => setColor(event.target.value)}>
              <option value="white">White</option>
              <option value="yellow">Yellow</option>
              <option value="red">Red</option>
              <option value="green">Green</option>
              <option value="blue">Blue</option>
              <option value="other">Other color</option>
            </select>
          </label>
          {color === 'other' && (
            <label>
              Other mark color
              <input name="customMarkColor" required maxLength={40} />
            </label>
          )}
        </>
      )}
      <label>
        Source
        <select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)}>
          <option value="unknown">Unknown or not recorded</option>
          <option value="raised_in_apiary">Raised in this apiary</option>
          <option value="purchased_breeder">Purchased from breeder</option>
          <option value="swarm_or_removal">Swarm or removal</option>
          <option value="other">Other source</option>
        </select>
      </label>
      {sourceKind === 'other' && (
        <label>
          Other source
          <input name="customSource" required maxLength={500} />
        </label>
      )}
      <label>
        Introduction date
        <input name="introductionDate" type="date" />
      </label>
      <label>
        Notes
        <textarea name="notes" rows={3} />
      </label>
      <button className="button primary" disabled={working}>
        {working ? 'Saving…' : 'Add queen'}
      </button>
    </form>
  );
}

function QuickForm({
  fields,
  select,
  acceptImages,
  submitLabel,
  onSubmit,
}: {
  fields: Field[];
  select?: { name: string; label: string; options: Array<[string, string]> };
  submitLabel: string;
  acceptImages?: boolean;
  onSubmit: (fields: Record<string, string>, files: File[]) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement).entries()) as Record<
      string,
      string
    >;
    const fileInput = formElement.elements.namedItem('photos');
    const files =
      fileInput instanceof HTMLInputElement && fileInput.files ? Array.from(fileInput.files) : [];
    try {
      delete values.photos;
      await onSubmit(values, files);
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save');
    } finally {
      setWorking(false);
    }
  }
  return (
    <form className="form compact" onSubmit={(event) => void submit(event)}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {select && (
        <label>
          {select.label}
          <select name={select.name} required>
            {select.options.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {fields.map(([name, label, required]) => (
        <label key={name}>
          {label}
          {name.toLowerCase().includes('notes') ? (
            <textarea name={name} required={required} rows={3} />
          ) : (
            <input name={name} required={required} />
          )}
        </label>
      ))}
      {acceptImages && (
        <label>
          Inspection photos
          <input
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            capture="environment"
          />
          <span className="field-hint">
            Photos are stored on this device immediately and upload after reconnection.
          </span>
        </label>
      )}
      <button className="button primary" disabled={working}>
        {working ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

function VersionView({
  session,
  onSignOut,
  onClear,
}: {
  session: ActiveSession;
  onSignOut: () => void;
  onClear: () => void;
}) {
  const [backendBuild, setBackendBuild] = useState<BuildIdentity>();
  const [backupWorking, setBackupWorking] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const standaloneBackup = api.standaloneBackupAvailable();
  // A device-managed owner has no credentials a person could sign back in
  // with, so offering sign-out would strand the workspace until a restart
  // re-provisions it (WIN-028).
  const deviceManaged = api.deviceManagedSession(session);
  useEffect(() => {
    void fetch('/health', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value) => {
        const identity = (value as { build?: BuildIdentity } | undefined)?.build;
        if (identity) setBackendBuild(identity);
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Account and build</h1>
        </div>
      </div>
      <section className="card details">
        {frontendBuild.releaseChannel === 'preview' && (
          <div className="preview-notice" role="note">
            <strong>Public Preview</strong>
            <span>
              Not yet GA. Features and workflows may change, updates may arrive frequently, and
              current backups are required.
            </span>
          </div>
        )}
        <dl>
          <dt>Signed in as</dt>
          <dd>{session.user.displayName}</dd>
          <dt>Role</dt>
          <dd>{session.membership.role}</dd>
          <dt>Product version</dt>
          <dd>{frontendBuild.productVersion}</dd>
          <dt>Release channel</dt>
          <dd>{frontendBuild.releaseChannel}</dd>
          <dt>API contract</dt>
          <dd>{frontendBuild.apiContract}</dd>
          <dt>Sync contract</dt>
          <dd>{frontendBuild.syncContract}</dd>
          <dt>Local store</dt>
          <dd>{frontendBuild.localStore}</dd>
          <dt>Database migration</dt>
          <dd>{frontendBuild.databaseMigration}</dd>
          <dt>Deployment plan</dt>
          <dd>{frontendBuild.deploymentPlan}</dd>
          <dt>Export format</dt>
          <dd>{frontendBuild.exportFormat}</dd>
          <dt>Frontend profile</dt>
          <dd>{frontendBuild.deploymentProfile}</dd>
          <dt>Source commit</dt>
          <dd>{frontendBuild.sourceCommit}</dd>
          <dt>Build time</dt>
          <dd>{frontendBuild.buildTime}</dd>
          <dt>Artifact identity</dt>
          <dd>{frontendBuild.artifactIdentity}</dd>
          <dt>Backend identity</dt>
          <dd>
            {backendBuild
              ? `${backendBuild.deploymentProfile} · ${backendBuild.sourceCommit} · migration ${backendBuild.databaseMigration}`
              : 'Unavailable while offline'}
          </dd>
        </dl>
        <div className="button-row">
          <a
            className="button secondary link-button"
            href={`https://apiarylens.org/releases/${frontendBuild.productVersion}/`}
          >
            Release notes and artifacts
          </a>
          <a
            className="button secondary link-button"
            href="https://apiarylens.org/docs/user/beekeeping-glossary/"
          >
            Beekeeping glossary
          </a>
          {!deviceManaged && (
            <button className="button secondary" onClick={onSignOut}>
              Sign out
            </button>
          )}
          <button className="button danger" onClick={onClear}>
            Clear local data
          </button>
        </div>
      </section>
      <SessionTransparency session={session} />
      {session.membership.role === 'owner' && (
        <section className="card backup-recovery">
          <div>
            <p className="eyebrow">Data protection</p>
            <h2>Backup and recovery</h2>
            <p>
              {standaloneBackup
                ? 'Create a verified portable backup of this Windows database and its original photos. Protected credentials are never added to the archive.'
                : `This device's offline working copy is not a server backup. A full export gives you a portable copy of family records and original photos. Verified backup and restore are performed through Scout Bee for the ${backendBuild?.deploymentProfile ?? 'current'} deployment profile.`}
            </p>
          </div>
          <dl>
            <dt>Last verified server backup</dt>
            <dd>
              {backupMessage ||
                (standaloneBackup
                  ? 'No backup has been created during this app session.'
                  : 'Open Scout Bee on the operator computer to see its protected operation history.')}
            </dd>
            <dt>Restore prerequisites</dt>
            <dd>
              Compatible verified archive, a pre-restore recovery backup, maintenance access, and a
              passing post-restore health check. Restore replaces server data and revokes active
              sessions.
            </dd>
          </dl>
          <div className="button-row">
            {standaloneBackup && (
              <>
                <button
                  className="button primary"
                  disabled={backupWorking}
                  onClick={() => {
                    setBackupWorking(true);
                    setBackupMessage('');
                    void api
                      .createStandaloneBackup()
                      .then((result) => {
                        if (result.status === 'saved') {
                          setBackupMessage(
                            `Verified ${result.files} files and saved the backup at ${new Date(result.createdAt).toLocaleString()}.`,
                          );
                        }
                      })
                      .catch((caught: unknown) =>
                        setBackupMessage(
                          caught instanceof Error ? caught.message : 'Backup could not be created.',
                        ),
                      )
                      .finally(() => setBackupWorking(false));
                  }}
                >
                  {backupWorking ? 'Recovery operation running…' : 'Create Windows backup'}
                </button>
                <button
                  className="button secondary"
                  disabled={backupWorking}
                  onClick={() => {
                    setBackupWorking(true);
                    setBackupMessage('');
                    void api
                      .restoreStandaloneBackup()
                      .then((result) => {
                        if (result.status === 'restored') {
                          setBackupMessage(
                            `Restored ${result.files} verified files. Sign in again to continue.`,
                          );
                        }
                      })
                      .catch((caught: unknown) =>
                        setBackupMessage(
                          caught instanceof Error
                            ? caught.message
                            : 'Restore could not be completed.',
                        ),
                      )
                      .finally(() => setBackupWorking(false));
                  }}
                >
                  Restore Windows backup
                </button>
                <button
                  className="button secondary"
                  disabled={backupWorking}
                  onClick={() => {
                    setBackupWorking(true);
                    setBackupMessage('');
                    void api
                      .migrateStandaloneToConnected()
                      .then((result) => {
                        if (result.status === 'connected') {
                          setBackupMessage(
                            `Verified ${result.records} records and ${result.media} media files. Restarting in connected mode…`,
                          );
                        }
                      })
                      .catch((caught: unknown) =>
                        setBackupMessage(
                          caught instanceof Error
                            ? caught.message
                            : 'Connection migration could not be completed.',
                        ),
                      )
                      .finally(() => setBackupWorking(false));
                  }}
                >
                  Connect with Scout Bee profile
                </button>
              </>
            )}
            <a className="button primary link-button" href="/api/v1/export/full">
              Download full export
            </a>
            <a
              className="button secondary link-button"
              href="https://apiarylens.org/docs/user/scout-bee-guide/#backup"
            >
              Open backup and restore guide
            </a>
          </div>
        </section>
      )}
      {session.membership.role === 'owner' && session.csrfToken && (
        <FamilyAccess csrfToken={session.csrfToken} />
      )}
    </>
  );
}

function currentClientDescription(): string {
  const userAgent = navigator.userAgent;
  const browser = userAgent.includes('Edg/')
    ? 'Edge'
    : userAgent.includes('Firefox/')
      ? 'Firefox'
      : userAgent.includes('CriOS') || userAgent.includes('Chrome/')
        ? 'Chrome'
        : userAgent.includes('Safari/')
          ? 'Safari'
          : 'Web browser';
  const platform = /iPad/.test(userAgent)
    ? 'iPad'
    : /iPhone/.test(userAgent)
      ? 'iPhone'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : 'this device';
  const installed = matchMedia('(display-mode: standalone)').matches ? 'installed app' : 'browser';
  return `${browser} on ${platform} · ${installed}`;
}

function SessionTransparency({ session }: { session: ActiveSession }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const expired = Date.parse(session.expiresAt) <= Date.now();
  async function revokeOthers() {
    if (!session.csrfToken) {
      setMessage(
        'Reconnect and sign in before changing sessions. Your offline records remain here.',
      );
      return;
    }
    if (!confirm('Sign out every other browser and installed app using this account?')) return;
    setWorking(true);
    try {
      const result = await api.revokeOtherSessions(session.csrfToken);
      setMessage(
        result.revoked === 0
          ? 'No other active sessions were found.'
          : `${result.revoked} other session${result.revoked === 1 ? '' : 's'} signed out.`,
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not revoke other sessions.');
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="card session-transparency">
      <div>
        <p className="eyebrow">Current sign-in</p>
        <h2>Device and session</h2>
        <p>
          The server sign-in is held in a secure browser cookie that application code cannot read.
          ApiaryLens caches only non-secret account context and synchronized records for offline
          use.
        </p>
      </div>
      <dl>
        <dt>Current client</dt>
        <dd>{currentClientDescription()}</dd>
        <dt>Server session</dt>
        <dd>
          {session.csrfToken
            ? `Connected · expires ${new Date(session.expiresAt).toLocaleString()}`
            : expired
              ? 'Expired while offline · sign in after reconnecting to synchronize'
              : 'Offline working session · reconnect to validate and synchronize'}
        </dd>
        <dt>Reconnect behavior</dt>
        <dd>
          Records remain usable offline. When connectivity returns, ApiaryLens validates the secure
          cookie and synchronizes automatically; it asks you to sign in only if the server session
          expired or was revoked.
        </dd>
      </dl>
      <div className="button-row">
        <button className="button secondary" disabled={working} onClick={() => void revokeOthers()}>
          {working ? 'Signing out…' : 'Sign out other devices'}
        </button>
      </div>
      {message && (
        <p className="field-hint" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function FamilyAccess({ csrfToken }: { csrfToken: string }) {
  const [members, setMembers] = useState<
    Array<{ id: string; displayName: string; identifier: string; role: string; status: string }>
  >([]);
  const [invitations, setInvitations] = useState<
    Array<{
      id: string;
      displayName: string;
      identifier: string;
      role: string;
      expiresAt: string;
      createdAt: string;
    }>
  >([]);
  const [invitationUrl, setInvitationUrl] = useState('');
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState('');

  function invitationLink(token: string): string {
    const url = new URL(location.origin);
    url.searchParams.set('invite', token);
    return url.toString();
  }

  async function refreshAccess() {
    const [memberResult, invitationResult] = await Promise.all([api.members(), api.invitations()]);
    setMembers(memberResult.items);
    setInvitations(invitationResult.items);
  }

  useEffect(() => {
    void refreshAccess().catch(() => setError('Could not load family access.'));
  }, []);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const invitation = await api.invite(csrfToken, {
        displayName: String(data.get('displayName')),
        identifier: String(data.get('identifier')),
        role: String(data.get('role')) as 'beekeeper' | 'viewer',
      });
      setInvitationUrl(invitationLink(invitation.token));
      await refreshAccess();
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create invitation');
    }
  }

  async function removeMember(member: { id: string; displayName: string }) {
    if (!confirm(`Remove ${member.displayName} from this family and sign out their devices?`))
      return;
    setWorkingId(member.id);
    setError('');
    try {
      await api.revokeMember(csrfToken, member.id);
      await refreshAccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove family member');
    } finally {
      setWorkingId('');
    }
  }

  async function revokeInvitation(invitationId: string) {
    setWorkingId(invitationId);
    setError('');
    try {
      await api.revokeInvitation(csrfToken, invitationId);
      setInvitationUrl('');
      await refreshAccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke invitation');
    } finally {
      setWorkingId('');
    }
  }

  async function replaceInvitation(invitationId: string) {
    setWorkingId(invitationId);
    setError('');
    try {
      const replacement = await api.replaceInvitation(csrfToken, invitationId);
      setInvitationUrl(invitationLink(replacement.token));
      await refreshAccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not replace invitation');
    } finally {
      setWorkingId('');
    }
  }
  return (
    <section className="card family-access">
      <h2>Family access</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.id}>
            <span>
              <strong>{member.displayName}</strong>
              <small>{member.identifier}</small>
            </span>
            <span className="member-actions">
              <span>{member.role}</span>
              {member.role !== 'owner' && member.status === 'active' && (
                <button
                  className="text-button"
                  type="button"
                  disabled={workingId === member.id}
                  onClick={() => void removeMember(member)}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <h3>Pending invitations</h3>
      {invitations.length === 0 ? (
        <p>No pending invitations.</p>
      ) : (
        <ul className="member-list">
          {invitations.map((invitation) => (
            <li key={invitation.id}>
              <span>
                <strong>{invitation.displayName}</strong>
                <small>
                  {invitation.identifier} · expires{' '}
                  {new Date(invitation.expiresAt).toLocaleString()}
                </small>
              </span>
              <span className="member-actions">
                <span>{invitation.role}</span>
                <button
                  className="text-button"
                  type="button"
                  disabled={workingId === invitation.id}
                  onClick={() => void replaceInvitation(invitation.id)}
                >
                  Replace link
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={workingId === invitation.id}
                  onClick={() => void revokeInvitation(invitation.id)}
                >
                  Revoke
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="form compact" onSubmit={(event) => void invite(event)}>
        <h3>Invite someone</h3>
        <label>
          Name
          <input name="displayName" required />
        </label>
        <label>
          Email or username
          <input name="identifier" required />
        </label>
        <label>
          Role
          <select name="role">
            <option value="beekeeper">Beekeeper — can add and edit records</option>
            <option value="viewer">Viewer — read only</option>
          </select>
        </label>
        <button className="button primary">Create 48-hour invitation</button>
      </form>
      {invitationUrl && (
        <div className="invite-result">
          <strong>Share this invitation privately:</strong>
          <input readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} />
        </div>
      )}
    </section>
  );
}
