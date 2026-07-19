import { useEffect, useState } from 'react';
import type { BuildIdentity } from '@apiarylens/contracts';
import { api } from '../../api.js';
import { frontendBuild, windowsPackageLabel } from '../../build-identity.js';
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
  const [backupWorking, setBackupWorking] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const standaloneBackup = api.standaloneBackupAvailable();
  const glossary = useGlossary();
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
          <a
            className="button secondary link-button"
            href={`https://apiarylens.org/releases/${frontendBuild.productVersion}/`}
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
      {session.membership.role === 'owner' && (
        <section className="card backup-recovery" id="backup-section">
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
        <div id="members-section">
          <FamilyAccess csrfToken={session.csrfToken} organizationId={session.organization.id} />
        </div>
      )}
    </>
  );
}
