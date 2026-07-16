import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createBuildIdentity, type BuildIdentity, type SessionView } from '@apiarylens/contracts';
import { api, type BootstrapSession } from './api.js';
import {
  cacheSession,
  cachedSession,
  clearLocalWorkspace,
  db,
  queueCreate,
  queueDelete,
  queueUpdate,
  resolveConflict,
  stageImage,
  synchronize,
  type LocalResource,
} from './db.js';

type Page = 'dashboard' | 'apiaries' | 'hives' | 'inspections' | 'care' | 'version';
type ActiveSession = Omit<SessionView, 'csrfToken'> & { csrfToken: string | undefined };
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
  const [offline, setOffline] = useState(!navigator.onLine);
  const [page, setPage] = useState<Page>('dashboard');
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration>();
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
    const online = () => {
      setOffline(false);
      void (async () => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
            const active = await api.session();
            await cacheSession(active);
            setSession(active);
            await synchronize(active.organization.id, active.csrfToken);
            setNotice('Reconnected and synchronized.');
            return;
          } catch (error) {
            lastError = error;
          }
        }
        setNotice(
          lastError instanceof Error
            ? `Reconnected, but synchronization failed: ${lastError.message}`
            : 'Reconnected, but synchronization failed. Tap Sync now to retry.',
        );
      })();
    };
    const offlineHandler = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineHandler);
    const updateReady = (event: Event) =>
      setUpdateRegistration((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener('apiarylens:update-ready', updateReady);
    void initialize();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offlineHandler);
      window.removeEventListener('apiarylens:update-ready', updateReady);
    };
  }, []);

  async function initialize() {
    try {
      if (new URLSearchParams(location.search).get('reset-demo') === '1') {
        await clearLocalWorkspace();
        history.replaceState(null, '', location.pathname);
      }
      const active = await api.session();
      await cacheSession(active);
      setSession(active);
      if (navigator.onLine) {
        await synchronize(active.organization.id, active.csrfToken).catch(() => {
          setNotice('Your saved local work is ready. Use Sync now when the server is available.');
        });
      }
    } catch {
      const cached = await cachedSession();
      if (cached) setSession({ ...cached, csrfToken: undefined });
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
    setSession(active);
    if ('recoveryCodes' in active) setRecoveryCodes(active.recoveryCodes);
    setNotice('Workspace ready.');
  }

  async function sync() {
    if (!session?.csrfToken) {
      setNotice('Reconnect and sign in before synchronizing. Your local work remains saved.');
      return;
    }
    setSyncing(true);
    try {
      await synchronize(session.organization.id, session.csrfToken);
      setNotice('Synchronization complete.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Synchronization failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function signOut() {
    if (session?.csrfToken) await api.signOut(session.csrfToken);
    setSession(undefined);
    setNotice('Signed out. Local records remain on this device until you clear them.');
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
        {page === 'dashboard' && <Dashboard organizationId={session.organization.id} />}
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

function Dashboard({ organizationId }: { organizationId: string }) {
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
        <article className="metric">
          <strong>{hives.filter((hive) => hive.data.status === 'active').length}</strong>
          <span>Active hives</span>
        </article>
        <article className="metric">
          <strong>{apiaries.length}</strong>
          <span>Apiaries</span>
        </article>
        <article className="metric">
          <strong>{openFollowUps.length}</strong>
          <span>Open follow-ups</span>
        </article>
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
            <QuickForm
              submitLabel="Add queen"
              fields={[
                ['identifier', 'Queen identifier', true],
                ['markColor', 'Mark color or year', false],
                ['year', 'Queen year', false],
                ['source', 'Source', false],
                ['introductionDate', 'Introduction date (YYYY-MM-DD)', false],
                ['notes', 'Notes', false],
              ]}
              select={{
                name: 'hiveId',
                label: 'Hive',
                options: records.map((item) => [item.id, String(item.data.name)]),
              }}
              onSubmit={async (fields) => {
                for (const current of queens.filter(
                  (queen) => queen.data.hiveId === fields.hiveId && queen.data.status === 'current',
                )) {
                  await queueUpdate(current, { status: 'superseded' });
                }
                await queueCreate(organizationId, 'queen', {
                  ...fields,
                  marked: Boolean(fields.markColor),
                  year: fields.year ? Number(fields.year) : null,
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
            <QuickForm
              submitLabel="Add box"
              fields={[
                ['position', 'Stack position (1 is bottom)', true],
                ['frameCount', 'Frame count', true],
                ['notes', 'Notes', false],
              ]}
              select={{
                name: 'hiveId',
                label: 'Hive',
                options: records.map((item) => [item.id, String(item.data.name)]),
              }}
              onSubmit={async (fields) => {
                await queueCreate(organizationId, 'equipmentBox', {
                  ...fields,
                  position: Number(fields.position),
                  frameCount: Number(fields.frameCount),
                  boxType: 'deep',
                  status: 'active',
                });
                onNotice('Equipment stack saved offline.');
              }}
            />
            <RecordList records={equipment} titleField="boxType" />
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
    const weather = {
      temperature: values.get('temperature') ? Number(values.get('temperature')) : null,
      temperatureUnit: String(values.get('temperatureUnit')),
      conditions: String(values.get('conditions') ?? ''),
      wind: String(values.get('wind') ?? ''),
    };
    const payload = {
      hiveId: String(values.get('hiveId')),
      inspectedAt: new Date(String(values.get('inspectedAt'))).toISOString(),
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
        <textarea
          name="broodCondition"
          rows={2}
          defaultValue={String(data?.broodCondition ?? '')}
        />
      </label>
      <label>
        Stores
        <textarea name="stores" rows={2} defaultValue={String(data?.stores ?? '')} />
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
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).conditions ?? '')
                  : ''
              }
            />
          </label>
          <label>
            Wind
            <input
              name="wind"
              defaultValue={
                data?.weather && typeof data.weather === 'object'
                  ? String((data.weather as Record<string, unknown>).wind ?? '')
                  : ''
              }
            />
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
  useEffect(() => {
    if (!local?.blob) {
      setLocalUrls(undefined);
      return;
    }
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
  const mediaReady = String(record.data.state) === 'ready' || local?.state === 'ready';
  const mediaSyncState = local?.state === 'failed' || !mediaReady ? 'failed' : record.syncState;
  return (
    <article className="media-card">
      {mediaReady ? (
        <a href={original} target="_blank" rel="noreferrer">
          <img
            src={thumbnail}
            alt={String(record.data.caption || `Inspection photo ${record.data.fileName}`)}
            loading="lazy"
          />
        </a>
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
        {!mediaReady && (
          <small>Return to the device that captured this photo, reconnect, and tap Sync now.</small>
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
            <CareForm organizationId={organizationId} hives={hives} onNotice={onNotice} />
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

function CareForm({ organizationId, hives, onNotice }: FormProps & { hives: LocalResource[] }) {
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
      <CareFields kind={kind} />
      <label>
        Notes
        <textarea name="notes" rows={3} />
      </label>
      <button className="button primary">Save care record</button>
    </form>
  );
}

function CareFields({ kind }: { kind: CareType }) {
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
        <label>
          Observation
          <input name="category" required />
        </label>
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
        <label>
          Feed type
          <input name="feedType" required />
        </label>
        <label>
          Amount
          <input name="amount" type="number" min="0" step="any" />
        </label>
        <label>
          Unit
          <input name="unit" />
        </label>
        <label>
          Reason
          <input name="reason" />
        </label>
      </>
    );
  if (kind === 'treatmentEvent')
    return (
      <>
        <label>
          Product or method
          <input name="productOrMethod" required />
        </label>
        <label>
          Removal date
          <input name="removalDate" type="date" />
        </label>
        <label>
          Dosage or amount
          <input name="dosageOrAmount" />
        </label>
        <label>
          Restrictions
          <input name="restrictions" />
        </label>
      </>
    );
  if (kind === 'harvest')
    return (
      <>
        <label>
          Quantity
          <input name="quantity" type="number" min="0" step="any" required />
        </label>
        <label>
          Unit
          <input name="unit" required placeholder="lb, kg, jars" />
        </label>
      </>
    );
  return (
    <>
      <label>
        Description
        <input name="description" required />
      </label>
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
    return `position ${record.data.position} · ${record.data.frameCount} frames · ${record.data.status}`;
  if (record.entityType === 'apiary')
    return String(
      record.data.location ||
        record.data.accessNotes ||
        new Date(record.updatedAt).toLocaleString(),
    );
  return undefined;
}

function SyncBadge({ state }: { state: LocalResource['syncState'] }) {
  return <span className={`sync-badge ${state}`}>{state}</span>;
}
function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

type Field = readonly [name: string, label: string, required: boolean];
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
        <dl>
          <dt>Signed in as</dt>
          <dd>{session.user.displayName}</dd>
          <dt>Role</dt>
          <dd>{session.membership.role}</dd>
          <dt>Product version</dt>
          <dd>{frontendBuild.productVersion}</dd>
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
          {session.membership.role === 'owner' && (
            <a className="button secondary link-button" href="/api/v1/export/full">
              Download full export
            </a>
          )}
          <button className="button secondary" onClick={onSignOut}>
            Sign out
          </button>
          <button className="button danger" onClick={onClear}>
            Clear local data
          </button>
        </div>
      </section>
      {session.membership.role === 'owner' && session.csrfToken && (
        <FamilyAccess csrfToken={session.csrfToken} />
      )}
    </>
  );
}

function FamilyAccess({ csrfToken }: { csrfToken: string }) {
  const [members, setMembers] = useState<
    Array<{ id: string; displayName: string; identifier: string; role: string; status: string }>
  >([]);
  const [invitationUrl, setInvitationUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .members()
      .then((result) => setMembers(result.items))
      .catch(() => setError('Could not load family members.'));
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
      const url = new URL(location.origin);
      url.searchParams.set('invite', invitation.token);
      setInvitationUrl(url.toString());
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create invitation');
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
            <span>{member.role}</span>
          </li>
        ))}
      </ul>
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
