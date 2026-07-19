import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { api } from '../../api.js';
import { db, lastLocalBackupAt, type LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import type { PageRequest } from '../../navigation.js';
import { Empty } from '../../components/Empty.js';
import { Sparkline } from '../../components/Sparkline.js';
import { glossaryEntries } from '../glossary/glossary-data.js';
import { useGlossary } from '../glossary/glossary-context.js';
import {
  cumulativeMonthlySeries,
  formatMiteReading,
  hiveStatusTag,
  latestInspectionByHive,
  latestMiteByHive,
  seasonHarvest,
} from '../board-data.js';
import { SeasonHarvestChart } from './SeasonHarvestChart.js';
import { WeatherPanel } from './WeatherPanel.js';
import {
  cacheMemberSummary,
  cachedMemberSummary,
  memberSummaryFreshness,
} from './members-summary.js';

/**
 * V2 "Clean Dashboard" overview. Composed of small self-contained blocks
 * (KPI row, status board, follow-up queue, harvest chart, conditions,
 * members, glossary) so the owner can reorder, drop, or extend blocks later —
 * the dashboard composition is deliberately NOT frozen by the T2 selection.
 */
export function Dashboard({
  organizationId,
  onNavigate,
}: {
  organizationId: string;
  onNavigate: (request: PageRequest) => void;
}) {
  const apiaries = useResources(organizationId, 'apiary');
  const hives = useResources(organizationId, 'hive');
  const inspections = useResources(organizationId, 'inspection');
  const followUps = useResources(organizationId, 'followUp');
  const miteCounts = useResources(organizationId, 'miteCount');
  const treatments = useResources(organizationId, 'treatmentEvent');
  const harvests = useResources(organizationId, 'harvest');
  // Local-only sessions replace the pending-sync block with the local-backup
  // block: no queued counts anywhere, first-class backup instead (WEB-001).
  const localOnly = api.localOnlySession();
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  const lastBackup = useLiveQuery(() => lastLocalBackupAt(), [], undefined);
  // Refresh the roster reading opportunistically; when the session or the
  // connection is unavailable the card falls back to the last honest reading
  // (or a "not synced" state), never to a fabricated count.
  const memberSummary = useLiveQuery(() => cachedMemberSummary(organizationId), [organizationId]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const members = await api.members();
        // Pending invitations sit behind a more privileged route; when this
        // session cannot read them the summary records "unknown" (null), never
        // a false zero.
        const invitations = await api
          .invitations()
          .then((result): readonly unknown[] | undefined => result.items)
          .catch(() => undefined);
        if (!cancelled) await cacheMemberSummary(organizationId, members.items, invitations);
      } catch {
        // Offline or no live session: keep the last honest reading.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const now = new Date();
  const year = now.getFullYear();
  const activeHives = hives.filter((hive) => hive.data.status === 'active');
  const openFollowUps = followUps
    .filter((item) => !item.data.completedAt)
    .sort((a, b) =>
      String(a.data.dueDate ?? '9999').localeCompare(String(b.data.dueDate ?? '9999')),
    );
  const harvest = seasonHarvest(harvests, year, now);
  const hiveSeries = cumulativeMonthlySeries(
    activeHives.map((hive) => String(hive.data.installDate ?? hive.createdAt)),
    now,
  );
  const hiveNames = new Map(hives.map((hive) => [hive.id, String(hive.data.name)]));
  const apiaryNames = new Map(apiaries.map((yard) => [yard.id, String(yard.data.name)]));

  return (
    <>
      <div className="page-h">
        <h1>Operations overview</h1>
        <span className="sub">
          {now.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}{' '}
          · all data local-first
        </span>
      </div>

      {/* Block: KPI row. Tiles are keyboard-native navigation controls. */}
      <section className="metric-grid" aria-label="Key figures — tiles open their pages">
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate({ page: 'hives', hiveStatus: 'active' })}
          aria-label="View active hives"
        >
          <span>Active hives</span>
          <div className="metric-row">
            <strong>{activeHives.length}</strong>
            <Sparkline values={hiveSeries} />
          </div>
          <small>open ›</small>
        </button>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate({ page: 'apiaries' })}
          aria-label="View apiaries"
        >
          <span>Apiaries</span>
          <div className="metric-row">
            <strong>{apiaries.length}</strong>
          </div>
          <small>
            {apiaries
              .slice(0, 2)
              .map((yard) => String(yard.data.name))
              .join(' · ') || 'open ›'}
          </small>
        </button>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate({ page: 'inspections' })}
          aria-label="View inspections"
        >
          <span>Inspections</span>
          <div className="metric-row">
            <strong>{inspections.length}</strong>
          </div>
          <small>open ›</small>
        </button>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate({ page: 'care', careView: 'open-follow-ups' })}
          aria-label="View open follow-ups"
        >
          <span>Open follow-ups</span>
          <div className="metric-row">
            <strong>{openFollowUps.length}</strong>
          </div>
          <small>
            {openFollowUps[0]?.data.dueDate
              ? `next due ${String(openFollowUps[0].data.dueDate)}`
              : 'open ›'}
          </small>
        </button>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate({ page: 'care' })}
          aria-label={`View season harvest records: ${harvest.total} ${harvest.unit ?? ''}`}
        >
          <span>Season harvest</span>
          <div className="metric-row">
            <strong>
              {harvest.total}
              {harvest.unit ? <span style={{ fontSize: 13 }}> {harvest.unit}</span> : null}
            </strong>
            <Sparkline values={harvest.series} />
          </div>
          <small>
            {harvest.byHive.length > 0
              ? `${harvest.byHive.length} hive${harvest.byHive.length === 1 ? '' : 's'} recorded`
              : 'no pulls recorded'}
          </small>
        </button>
        {memberSummary ? (
          <button
            className="metric metric-link"
            type="button"
            onClick={() => onNavigate({ page: 'version', accountSection: 'members' })}
            aria-label={`View family members: ${memberSummary.activeMembers} active${
              typeof memberSummary.invitedMembers === 'number' && memberSummary.invitedMembers > 0
                ? `, ${memberSummary.invitedMembers} invited`
                : ''
            }. ${memberSummaryFreshness(memberSummary.fetchedAt)}.`}
          >
            <span>Members</span>
            <div className="metric-row">
              <strong>{memberSummary.activeMembers}</strong>
            </div>
            <small>
              {typeof memberSummary.invitedMembers === 'number' && memberSummary.invitedMembers > 0
                ? `${memberSummary.invitedMembers} invited · `
                : ''}
              {memberSummaryFreshness(memberSummary.fetchedAt)}
            </small>
          </button>
        ) : (
          <button
            className="metric metric-link"
            type="button"
            onClick={() => onNavigate({ page: 'version', accountSection: 'members' })}
            aria-label={
              localOnly
                ? 'View family members. The roster is not loaded yet.'
                : 'View family members. The roster has not synced to this device yet.'
            }
          >
            <span>Members</span>
            <div className="metric-row">
              <strong aria-hidden="true">–</strong>
            </div>
            <small>{localOnly ? 'Not loaded yet' : 'Not synced to this device yet'}</small>
          </button>
        )}
        {localOnly ? (
          <button
            className="metric metric-link"
            type="button"
            onClick={() => onNavigate({ page: 'version', accountSection: 'backup' })}
            aria-label={
              lastBackup
                ? `Open backup and restore. The newest backup from this device is from ${new Date(lastBackup).toLocaleString()}.`
                : 'Open backup and restore. No backup has been recorded on this device.'
            }
          >
            <span>Local backup</span>
            <div className="metric-row">
              <strong>{lastBackup ? new Date(lastBackup).toLocaleDateString() : '—'}</strong>
            </div>
            <small>
              {lastBackup ? 'newest backup from this device' : 'no backup recorded on this device'}
            </small>
          </button>
        ) : (
          <article className="metric pending">
            <span>Outbox</span>
            <div className="metric-row">
              <strong>{pending}</strong>
            </div>
            <small>retries safe · no duplicates</small>
          </article>
        )}
      </section>

      <div className="grid g2">
        <HiveStatusBoard
          hives={hives}
          inspections={inspections}
          miteCounts={miteCounts}
          treatments={treatments}
          apiaryNames={apiaryNames}
          onNavigate={onNavigate}
        />
        <FollowUpQueue followUps={openFollowUps} hiveNames={hiveNames} onNavigate={onNavigate} />
      </div>

      <div className="grid g2">
        <div className="panel">
          <div className="panel-h">
            <h2>Season harvest by hive</h2>
          </div>
          <div className="panel-b">
            <SeasonHarvestChart harvest={harvest} hiveNames={hiveNames} year={year} />
          </div>
        </div>
        <WeatherPanel inspections={inspections} hiveNames={hiveNames} />
      </div>

      <div className="grid g2">
        <MembersBlockNote onNavigate={onNavigate} />
        <GlossaryQuickReference />
      </div>
    </>
  );
}

/** Block: dense hive status board — every non-archived hive in one table. */
function HiveStatusBoard({
  hives,
  inspections,
  miteCounts,
  treatments,
  apiaryNames,
  onNavigate,
}: {
  hives: LocalResource[];
  inspections: LocalResource[];
  miteCounts: LocalResource[];
  treatments: LocalResource[];
  apiaryNames: Map<string, string>;
  onNavigate: (request: PageRequest) => void;
}) {
  const latestInspection = latestInspectionByHive(inspections);
  const latestMite = latestMiteByHive(miteCounts);
  const now = new Date().toISOString();
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Hive status board</h2>
        <span className="spacer"></span>
        <button className="linkish" type="button" onClick={() => onNavigate({ page: 'hives' })}>
          All hives ›
        </button>
      </div>
      {hives.length === 0 ? (
        <div className="panel-b">
          <Empty text="Add your first hive to begin its history." />
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Hive</th>
                <th>Yard</th>
                <th>Last insp.</th>
                <th className="num">Mites</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {hives.map((hive) => {
                const inspection = latestInspection.get(hive.id);
                const status = hiveStatusTag(hive, treatments, now);
                return (
                  <tr key={hive.id}>
                    <td>
                      <button
                        className="row-link"
                        type="button"
                        onClick={() => onNavigate({ page: 'hive', hiveId: hive.id })}
                        aria-label={`Open hive ${String(hive.data.name)}`}
                      >
                        {String(hive.data.name)}
                      </button>
                    </td>
                    <td>{apiaryNames.get(String(hive.data.apiaryId)) ?? '—'}</td>
                    <td>
                      {inspection ? (
                        <>
                          {new Date(String(inspection.data.inspectedAt)).toLocaleDateString()}
                          {inspection.data.inspectorName ? (
                            <span className="sub-t">
                              {' '}
                              · {String(inspection.data.inspectorName)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="sub-t">n/a</span>
                      )}
                    </td>
                    <td className="num">{formatMiteReading(latestMite.get(hive.id))}</td>
                    <td>
                      <span className={`tag ${status.tone}`}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Block: open follow-ups, soonest due first. */
function FollowUpQueue({
  followUps,
  hiveNames,
  onNavigate,
}: {
  followUps: LocalResource[];
  hiveNames: Map<string, string>;
  onNavigate: (request: PageRequest) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Follow-up queue</h2>
        <span className="spacer"></span>
        <button
          className="linkish"
          type="button"
          onClick={() => onNavigate({ page: 'care', careView: 'open-follow-ups' })}
        >
          Care ›
        </button>
      </div>
      {followUps.length === 0 ? (
        <div className="panel-b">
          <Empty text="No open follow-up items." />
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Due</th>
                <th>Task</th>
                <th>Hive</th>
                {!api.localOnlySession() && <th>Sync</th>}
              </tr>
            </thead>
            <tbody>
              {followUps.map((item) => (
                <tr key={item.key}>
                  <td className="num">
                    {item.data.dueDate ? (
                      new Date(`${item.data.dueDate}T12:00:00`).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    ) : (
                      <span className="sub-t">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="row-link"
                      type="button"
                      onClick={() => onNavigate({ page: 'care', careView: 'open-follow-ups' })}
                      aria-label={`View follow-up: ${String(item.data.description)}`}
                    >
                      {String(item.data.description)}
                    </button>
                  </td>
                  <td>{hiveNames.get(String(item.data.hiveId)) ?? '—'}</td>
                  {!api.localOnlySession() && (
                    <td>
                      <span className={`tag ${item.syncState === 'synchronized' ? 'ok' : 'warn'}`}>
                        {item.syncState === 'synchronized' ? 'SYNCED' : 'QUEUED'}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Block: pointer into the Members administration surface. */
function MembersBlockNote({ onNavigate }: { onNavigate: (request: PageRequest) => void }) {
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Members</h2>
        <span className="spacer"></span>
        <button
          className="linkish"
          type="button"
          onClick={() => onNavigate({ page: 'version', accountSection: 'members' })}
        >
          Manage members ›
        </button>
      </div>
      <div className="panel-b">
        <p className="sub-t" style={{ margin: 0 }}>
          The family roster and invitations live under Administration → Members. Invitations let
          each member set their own password; roles are enforced server-side. The Members tile above
          shows this device's last honest roster reading.
        </p>
      </div>
    </div>
  );
}

/** Block: glossary quick reference — first entries, opening the full panel. */
function GlossaryQuickReference() {
  const glossary = useGlossary();
  const entries = glossaryEntries.slice(0, 4);
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Glossary quick reference</h2>
        <span className="spacer"></span>
        <button
          className="linkish"
          type="button"
          onClick={() => glossary.open()}
          aria-haspopup="dialog"
        >
          Full glossary ›
        </button>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Term</th>
              <th>Definition (first line)</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <button
                    className="row-link"
                    type="button"
                    onClick={() => glossary.open(entry.id)}
                    aria-haspopup="dialog"
                  >
                    {entry.term}
                  </button>
                </td>
                <td className="sub-t">
                  {entry.definition.length > 96
                    ? `${entry.definition.slice(0, 96)}…`
                    : entry.definition}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
