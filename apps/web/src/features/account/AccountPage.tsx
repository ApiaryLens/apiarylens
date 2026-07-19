import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { BuildIdentity } from '@apiarylens/contracts';
import { api } from '../../api.js';
import { frontendBuild, windowsPackageLabel } from '../../build-identity.js';
import { lastLocalBackupAt, recordLocalBackup } from '../../db.js';
import type { AccountSection } from '../../navigation.js';
import type { ActiveSession } from '../../session.js';
import { useGlossary } from '../glossary/glossary-context.js';
import { FamilyAccess } from './FamilyAccess.js';
import { SessionTransparency } from './SessionTransparency.js';

const sectionAnchors: Record<AccountSection, string> = {
  account: 'account-section',
  backup: 'backup-section',
  members: 'members-section',
};

export function VersionView({
  session,
  section,
  onSignOut,
  onClear,
}: {
  session: ActiveSession;
  /** Administration sidebar target: scrolls the matching section into view. */
  section?: AccountSection;
  onSignOut: () => void;
  onClear: () => void;
}) {
  const [backendBuild, setBackendBuild] = useState<BuildIdentity>();
  // Local-only sessions (no cloud backend) get the first-class local
  // backup/restore section in the prominent first position; connected
  // sessions keep the server-backup guidance below the build details
  // (design v2 §1c, WEB-001).
  const localOnly = api.localOnlySession();
  const glossary = useGlossary();
  const isOwner = session.membership.role === 'owner';
  // A device-managed owner has no credentials a person could sign back in
  // with, so offering sign-out would strand the workspace until a restart
  // re-provisions it (WIN-028).
  const deviceManaged = api.deviceManagedSession(session);
  useEffect(() => {
    if (!section || section === 'account') return;
    document.getElementById(sectionAnchors[section])?.scrollIntoView({ block: 'start' });
  }, [section]);
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
      <div className="page-heading" id="account-section">
        <div>
          <h1>Account and build</h1>
        </div>
      </div>
      {localOnly && isOwner && <LocalBackupSection session={session} onRestored={onClear} />}
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
        {windowsPackageLabel && (
          <div className="preview-notice" role="note">
            <strong>{windowsPackageLabel}</strong>
            <span>
              This Windows preview build is not Authenticode signed, so Windows SmartScreen and
              Defender warn that it comes from an unverified publisher. That warning is accurate.
              Only install a copy whose SHA-256 you verified against the published release
              checksums.
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
          {/* Owner UAT fix (2026-07-19): the version-interpolated
              `/releases/<version>/` route on apiarylens.org has no page (the
              worker only redirects windows artifact paths), and per-version
              docs pages are allowlist-gated on the site. The Version and Build
              view must link the exact displayed build to its matching release
              notes (mvp-definition, versioning lifecycle), so this points at
              the GitHub release tag for `productVersion` — version-exact,
              always published, and it carries the notes and the artifacts. */}
          <a
            className="button secondary link-button"
            href={`https://github.com/ApiaryLens/apiarylens/releases/tag/v${frontendBuild.productVersion}`}
          >
            Release notes and artifacts
          </a>
          <button
            type="button"
            className="button secondary"
            onClick={() => glossary.open()}
            aria-haspopup="dialog"
          >
            Beekeeping glossary
          </button>
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
      {!localOnly && isOwner && (
        <section className="card backup-recovery" id="backup-section">
          <div>
            <p className="eyebrow">Data protection</p>
            <h2>Backup and recovery</h2>
            <p>
              {`This device's offline working copy is not a server backup. A full export gives you a portable copy of family records and original photos. Verified backup and restore are performed through Scout Bee for the ${backendBuild?.deploymentProfile ?? 'current'} deployment profile.`}
            </p>
          </div>
          <dl>
            <dt>Last verified server backup</dt>
            <dd>Open Scout Bee on the operator computer to see its protected operation history.</dd>
            <dt>Restore prerequisites</dt>
            <dd>
              Compatible verified archive, a pre-restore recovery backup, maintenance access, and a
              passing post-restore health check. Restore replaces server data and revokes active
              sessions.
            </dd>
          </dl>
          <div className="button-row">
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
      {isOwner && session.csrfToken && (
        <div id="members-section">
          <FamilyAccess csrfToken={session.csrfToken} organizationId={session.organization.id} />
        </div>
      )}
    </>
  );
}

type PendingRestore = { kind: 'file'; file: File } | { kind: 'native' };

/**
 * First-class local backup and restore for local-only sessions (WEB-001,
 * design v2 §1c). The records live only on this computer, so a downloaded
 * backup file — and a restore path with full integrity verification and an
 * honest overwrite warning — replaces every sync affordance this mode hides.
 */
function LocalBackupSection({
  session,
  onRestored,
}: {
  session: ActiveSession;
  /** Clears the on-device replica and reloads so the restored data is re-read. */
  onRestored: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingRestore, setPendingRestore] = useState<PendingRestore>();
  const lastBackup = useLiveQuery(() => lastLocalBackupAt(), [], undefined);
  const nativeBackup = api.standaloneBackupAvailable();

  function finishWith(text: string) {
    setMessage(text);
    setWorking(false);
  }

  function createNativeBackup() {
    setWorking(true);
    setMessage('');
    void api
      .createStandaloneBackup()
      .then(async (result) => {
        if (result.status === 'saved') {
          await recordLocalBackup();
          finishWith(
            `Verified ${result.files} files and saved the backup at ${new Date(result.createdAt).toLocaleString()}.`,
          );
        } else {
          setWorking(false);
        }
      })
      .catch((caught: unknown) =>
        finishWith(caught instanceof Error ? caught.message : 'Backup could not be created.'),
      );
  }

  function confirmRestore() {
    const request = pendingRestore;
    setPendingRestore(undefined);
    if (!request) return;
    setWorking(true);
    setMessage('');
    if (request.kind === 'native') {
      void api
        .restoreStandaloneBackup()
        .then((result) => {
          if (result.status === 'restored') {
            finishWith(`Restored ${result.files} verified files. Sign in again to continue.`);
          } else {
            setWorking(false);
          }
        })
        .catch((caught: unknown) =>
          finishWith(caught instanceof Error ? caught.message : 'Restore could not be completed.'),
        );
      return;
    }
    const csrfToken = session.csrfToken;
    if (!csrfToken) {
      finishWith('Reopen the app, then try the restore again.');
      return;
    }
    void api
      .importFullBackup(csrfToken, request.file)
      .then((result) => {
        setMessage(
          `Restored ${result.imported} records${
            result.mediaFiles > 0 ? ` and ${result.mediaFiles} photos` : ''
          } from the backup.${
            result.mediaMissing > 0
              ? ` ${result.mediaMissing} photo${result.mediaMissing === 1 ? ' was' : 's were'} not inside the backup file and could not be restored.`
              : ''
          } Reloading…`,
        );
        // Drop the on-device replica so the app re-reads the restored records.
        setTimeout(onRestored, 1500);
      })
      .catch((caught: unknown) =>
        finishWith(
          caught instanceof Error
            ? caught.message
            : 'The backup could not be restored. Nothing was changed.',
        ),
      );
  }

  return (
    <section className="card backup-recovery" id="backup-section">
      <div>
        <p className="eyebrow">Data protection</p>
        <h2>Backup and restore</h2>
        <p>
          Your apiary records live only on this computer — there is no cloud copy. A downloaded
          backup file is your family's safety net; keep a current one somewhere safe, like another
          drive or another computer.
        </p>
      </div>
      <dl>
        <dt>Newest backup from this device</dt>
        <dd>
          {message ||
            (lastBackup
              ? new Date(lastBackup).toLocaleString()
              : 'No backup has been recorded on this device yet.')}
        </dd>
        <dt>What a restore does</dt>
        <dd>
          Replaces every record and photo in this apiary with the verified contents of the backup
          you choose. The file is fully checked first; a damaged or foreign file is refused and
          nothing changes.
        </dd>
      </dl>
      {pendingRestore && (
        <div className="preview-notice" role="alert">
          <strong>
            {pendingRestore.kind === 'file'
              ? `Replace everything with "${pendingRestore.file.name}"?`
              : 'Replace everything with a backup archive?'}
          </strong>
          <span>
            Restoring replaces every record and photo in this apiary with the backup's contents.
            Anything your family added after that backup was made will be gone.
            {pendingRestore.kind === 'native'
              ? ' A recovery backup of the current data is saved first.'
              : ' This cannot be undone.'}
          </span>
          <div className="button-row">
            <button className="button danger" disabled={working} onClick={confirmRestore}>
              Yes, replace everything
            </button>
            <button className="button secondary" onClick={() => setPendingRestore(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="button-row">
        <a
          className="button primary link-button"
          href="/api/v1/export/full"
          onClick={() => void recordLocalBackup()}
        >
          Download backup file
        </a>
        <label className={`button secondary link-button${working ? ' disabled' : ''}`}>
          Restore from backup file…
          <input
            type="file"
            accept=".zip,application/zip"
            hidden
            disabled={working}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) setPendingRestore({ kind: 'file', file });
            }}
          />
        </label>
        {nativeBackup && (
          <>
            <button className="button secondary" disabled={working} onClick={createNativeBackup}>
              {working ? 'Recovery operation running…' : 'Create verified Windows backup'}
            </button>
            <button
              className="button secondary"
              disabled={working}
              onClick={() => setPendingRestore({ kind: 'native' })}
            >
              Restore verified Windows backup
            </button>
            <button
              className="button secondary"
              disabled={working}
              onClick={() => {
                setWorking(true);
                setMessage('');
                void api
                  .migrateStandaloneToConnected()
                  .then((result) => {
                    if (result.status === 'connected') {
                      finishWith(
                        `Verified ${result.records} records and ${result.media} media files. Restarting in connected mode…`,
                      );
                    } else {
                      setWorking(false);
                    }
                  })
                  .catch((caught: unknown) =>
                    finishWith(
                      caught instanceof Error
                        ? caught.message
                        : 'Connection migration could not be completed.',
                    ),
                  );
              }}
            >
              Connect with Scout Bee profile
            </button>
          </>
        )}
      </div>
    </section>
  );
}
