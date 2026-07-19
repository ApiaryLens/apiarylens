import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { api } from '../../api.js';
import { db, type LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import type { PageRequest } from '../../navigation.js';
import { Empty } from '../../components/Empty.js';
import {
  cacheMemberSummary,
  cachedMemberSummary,
  memberSummaryFreshness,
} from './members-summary.js';

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
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  // Refresh the roster reading opportunistically; when the session or the
  // connection is unavailable the card falls back to the last honest reading
  // (or a "not synced" state), never to a fabricated count.
  const memberSummary = useLiveQuery(() => cachedMemberSummary(organizationId), [organizationId]);
  useEffect(() => {
    let cancelled = false;
    api
      .members()
      .then((result) => {
        if (!cancelled) return cacheMemberSummary(organizationId, result.items);
        return undefined;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [organizationId]);
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
          onClick={() => onNavigate({ page: 'hives', hiveStatus: 'active' })}
          aria-label="View active hives"
        >
          <strong>{hives.filter((hive) => hive.data.status === 'active').length}</strong>
          <span>Active hives</span>
        </button>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate({ page: 'apiaries' })}
          aria-label="View apiaries"
        >
          <strong>{apiaries.length}</strong>
          <span>Apiaries</span>
        </button>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate({ page: 'inspections' })}
          aria-label="View inspections"
        >
          <strong>{inspections.length}</strong>
          <span>Inspections</span>
        </button>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate({ page: 'care', careView: 'open-follow-ups' })}
          aria-label="View open follow-ups"
        >
          <strong>{openFollowUps.length}</strong>
          <span>Open follow-ups</span>
        </button>
        {memberSummary ? (
          <button
            className="metric metric-link"
            type="button"
            onClick={() => onNavigate({ page: 'version' })}
            aria-label={`View family members: ${memberSummary.activeMembers} active${
              memberSummary.invitedMembers > 0 ? `, ${memberSummary.invitedMembers} invited` : ''
            }. ${memberSummaryFreshness(memberSummary.fetchedAt)}.`}
          >
            <strong>{memberSummary.activeMembers}</strong>
            <span>Members</span>
            <small>
              {memberSummary.invitedMembers > 0 ? `${memberSummary.invitedMembers} invited · ` : ''}
              {memberSummaryFreshness(memberSummary.fetchedAt)}
            </small>
          </button>
        ) : (
          <button
            className="metric metric-link"
            type="button"
            onClick={() => onNavigate({ page: 'version' })}
            aria-label="View family members. The roster has not synced to this device yet."
          >
            <strong aria-hidden="true">–</strong>
            <span>Members</span>
            <small>Not synced to this device yet</small>
          </button>
        )}
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
                    <button
                      type="button"
                      className="dashboard-list-link"
                      onClick={() => onNavigate({ page: 'inspections', hiveId: hive.id })}
                      aria-label={`View inspections for ${String(hive.data.name)}`}
                    >
                      <strong>{String(hive.data.name)}</strong>
                      <span>
                        {inspection
                          ? `${new Date(String(inspection.data.inspectedAt)).toLocaleString()} · ${String(inspection.data.state)}`
                          : 'No inspection recorded yet'}
                      </span>
                    </button>
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
                  <button
                    type="button"
                    className="dashboard-list-link"
                    onClick={() => onNavigate({ page: 'care', careView: 'open-follow-ups' })}
                    aria-label={`View follow-up: ${String(item.data.description)}`}
                  >
                    <strong>{String(item.data.description)}</strong>
                    <span>
                      {item.data.dueDate
                        ? `Due ${new Date(`${item.data.dueDate}T12:00:00`).toLocaleDateString()}`
                        : 'No due date'}{' '}
                      · {item.syncState}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </>
  );
}
