import { useState } from 'react';
import type { LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import type { PageRequest } from '../../navigation.js';
import { Empty } from '../../components/Empty.js';
import { Sparkline } from '../../components/Sparkline.js';
import { SyncBadge } from '../../components/SyncBadge.js';
import { formatWeatherSummary } from '../../weather-fields.js';
import {
  formatMiteReading,
  hiveStatusTag,
  latestMiteByHive,
  miteSeriesForHive,
} from '../board-data.js';
import { yesNo } from '../inspections/format.js';
import {
  currentQueen,
  filterHiveInspections,
  inspectionRangeLabel,
  inspectorNames,
  queenMark,
  type InspectionRange,
} from './hive-detail-data.js';
import { stackCount, stackSummary } from './hive-stack.js';
import { HiveStack } from './HiveStack.js';
import { VarroaChart } from './VarroaChart.js';

/**
 * V2 hive detail screen (mock-up screen 2): identity header, KPI row, season
 * varroa trend, queen & configuration with the FB-009 stack schematic, and a
 * filterable dense inspection history table.
 */
export function HiveDetail({
  organizationId,
  hiveId,
  onNavigate,
}: {
  organizationId: string;
  hiveId: string;
  onNavigate: (request: PageRequest) => void;
}) {
  const hives = useResources(organizationId, 'hive');
  const apiaries = useResources(organizationId, 'apiary');
  const queens = useResources(organizationId, 'queen');
  const equipment = useResources(organizationId, 'equipmentBox');
  const inspections = useResources(organizationId, 'inspection');
  const miteCounts = useResources(organizationId, 'miteCount');
  const treatments = useResources(organizationId, 'treatmentEvent');
  const followUps = useResources(organizationId, 'followUp');
  const [range, setRange] = useState<InspectionRange>('season');
  const [inspector, setInspector] = useState('all');

  const hive = hives.find((record) => record.id === hiveId);
  if (!hive) {
    return (
      <>
        <div className="page-h">
          <h1>Hive not found</h1>
        </div>
        <Empty text="This hive is not in the local workspace." />
        <p>
          <button className="linkish" type="button" onClick={() => onNavigate({ page: 'hives' })}>
            ‹ All hives
          </button>
        </p>
      </>
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const apiary = apiaries.find((record) => record.id === String(hive.data.apiaryId));
  const status = hiveStatusTag(hive, treatments, now.toISOString());
  const queen = currentQueen(queens, hiveId);
  const mark = queen ? queenMark(queen.data) : undefined;
  const miteSeries = miteSeriesForHive(miteCounts, hiveId);
  const latestMite = latestMiteByHive(miteCounts).get(hiveId);
  const seasonInspections = inspections.filter(
    (record) =>
      String(record.data.hiveId) === hiveId &&
      String(record.data.inspectedAt).slice(0, 4) === String(year),
  );
  const lastInspection = filterHiveInspections(
    inspections,
    hiveId,
    { range: 'all', inspector: 'all' },
    now,
  )[0];
  const openHiveFollowUps = followUps.filter(
    (record) => String(record.data.hiveId) === hiveId && !record.data.completedAt,
  );
  const visibleInspections = filterHiveInspections(inspections, hiveId, { range, inspector }, now);
  const inspectors = inspectorNames(inspections, hiveId);
  const components = stackCount(equipment, hiveId);

  return (
    <>
      <div className="page-h">
        <h1>{String(hive.data.name)}</h1>
        <span className={`tag ${status.tone}`}>{status.label}</span>
        <span className="sub">
          {apiary ? (
            <button
              className="linkish"
              type="button"
              onClick={() => onNavigate({ page: 'apiary', apiaryId: apiary.id })}
            >
              {String(apiary.data.name)}
            </button>
          ) : (
            'No apiary'
          )}
          {hive.data.installDate ? <> · installed {String(hive.data.installDate)}</> : null}
          {hive.data.origin ? <> · origin: {String(hive.data.origin)}</> : null} ·{' '}
          <span className="mono">{hive.id.slice(0, 8)}</span>
        </span>
      </div>

      <section className="metric-grid" aria-label="Hive key figures">
        <article className="metric">
          <span>
            {latestMite?.per100 !== null && latestMite ? 'Mites / 100 bees' : 'Mite count'}
          </span>
          <div className="metric-row">
            <strong>{formatMiteReading(latestMite)}</strong>
            <Sparkline
              values={miteSeries.map((reading) =>
                reading.per100 !== null ? reading.per100 : reading.count,
              )}
            />
          </div>
          <small>
            {latestMite
              ? `measured ${new Date(latestMite.measuredAt).toLocaleDateString()}`
              : 'no counts recorded'}
          </small>
        </article>
        <article className="metric">
          <span>Inspections {year}</span>
          <div className="metric-row">
            <strong>{seasonInspections.length}</strong>
          </div>
          <small>
            {lastInspection
              ? `last ${new Date(String(lastInspection.data.inspectedAt)).toLocaleDateString()} · ${String(lastInspection.data.inspectorName)}`
              : 'none yet'}
          </small>
        </article>
        <article className="metric">
          <span>Stack</span>
          <div className="metric-row">
            <strong>{components}</strong>
          </div>
          <small>{stackSummary(equipment, hiveId)}</small>
        </article>
        <button
          className="metric metric-link"
          type="button"
          onClick={() => onNavigate({ page: 'care', careView: 'open-follow-ups' })}
          aria-label={`View ${openHiveFollowUps.length} open follow-ups for this hive`}
        >
          <span>Open follow-ups</span>
          <div className="metric-row">
            <strong>{openHiveFollowUps.length}</strong>
          </div>
          <small>
            {openHiveFollowUps[0]?.data.dueDate
              ? `next due ${String(openHiveFollowUps[0].data.dueDate)}`
              : 'open the care queue'}
          </small>
        </button>
      </section>

      <div className="grid g2">
        <div className="panel">
          <div className="panel-h">
            <h2>Varroa load — season</h2>
            <span className="spacer"></span>
            <span className="sub-t">observations, not a diagnosis</span>
          </div>
          <div className="panel-b">
            <VarroaChart readings={miteSeries} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <h2>Queen &amp; configuration</h2>
          </div>
          <div className="panel-b">
            {queen ? (
              <dl className="kv">
                <dt>Queen</dt>
                <dd>
                  {mark && (
                    <span
                      className="qmark"
                      style={{ background: mark.hex }}
                      aria-hidden="true"
                    ></span>
                  )}
                  {String(queen.data.identifier)}
                  {mark ? ` — ${mark.label}` : queen.data.marked ? ' — marked' : ' — unmarked'}
                </dd>
                <dt>Status</dt>
                <dd>{String(queen.data.status)}</dd>
                {queen.data.source ? (
                  <>
                    <dt>Source</dt>
                    <dd>{String(queen.data.source)}</dd>
                  </>
                ) : null}
                {queen.data.introductionDate ? (
                  <>
                    <dt>Introduced</dt>
                    <dd>{String(queen.data.introductionDate)}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="sub-t">No current queen recorded. Record one under Hives.</p>
            )}
            <div style={{ marginTop: 12 }}>
              <HiveStack equipment={equipment} hiveId={hiveId} />
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <h2>Inspection history</h2>
          <span className="spacer"></span>
          <button
            className="linkish"
            type="button"
            onClick={() => onNavigate({ page: 'inspections', hiveId })}
          >
            Open in Inspections ›
          </button>
        </div>
        <div className="filters" aria-label="Inspection filters">
          {(['season', '90d', 'all'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={`f${range === candidate ? ' on' : ''}`}
              aria-pressed={range === candidate}
              onClick={() => setRange(candidate)}
            >
              {inspectionRangeLabel(candidate, year)}
            </button>
          ))}
          {inspectors.length > 1 && (
            <select
              aria-label="Inspector"
              value={inspector}
              onChange={(event) => setInspector(event.currentTarget.value)}
            >
              <option value="all">All inspectors</option>
              {inspectors.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
        {visibleInspections.length === 0 ? (
          <div className="panel-b">
            <Empty text="No inspections match this filter." />
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Inspector</th>
                  <th>Temperament</th>
                  <th>Population</th>
                  <th>Queen</th>
                  <th>Eggs</th>
                  <th>Brood / stores</th>
                  <th>Notes</th>
                  <th>Weather</th>
                  <th>Sync</th>
                </tr>
              </thead>
              <tbody>
                {visibleInspections.map((record) => (
                  <tr key={record.key}>
                    <td className="num">
                      {new Date(String(record.data.inspectedAt)).toLocaleDateString()}
                      <br />
                      <span className="sub-t">
                        {new Date(String(record.data.inspectedAt)).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td>{String(record.data.inspectorName)}</td>
                    <td>{String(record.data.temperament).replaceAll('_', ' ')}</td>
                    <td>{String(record.data.populationStrength).replaceAll('_', ' ')}</td>
                    <td>
                      <span className={`tag ${record.data.queenSeen ? 'ok' : 'mut'}`}>
                        {record.data.queenSeen ? 'SEEN' : 'NOT SEEN'}
                      </span>
                    </td>
                    <td>{yesNo(record.data.eggsOrLarvae)}</td>
                    <td>
                      {String(record.data.broodCondition || '—')}
                      {record.data.stores ? (
                        <>
                          <br />
                          <span className="sub-t">{String(record.data.stores)}</span>
                        </>
                      ) : null}
                    </td>
                    <td>{String(record.data.notes || '—')}</td>
                    <td className="sub-t">{formatWeatherSummary(record.data.weather)}</td>
                    <td>
                      <SyncBadge state={record.syncState} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
