import type { LocalResource } from '../../db.js';
import { useResources } from '../../local/use-resources.js';
import type { PageRequest } from '../../navigation.js';
import { Empty } from '../../components/Empty.js';
import { formatWeatherSummary } from '../../weather-fields.js';
import {
  formatMiteReading,
  hiveStatusTag,
  latestInspectionByHive,
  latestMiteByHive,
  seasonHarvest,
} from '../board-data.js';
import { currentQueen, queenMark } from '../hives/hive-detail-data.js';
import { stackCount } from '../hives/hive-stack.js';

/**
 * V2 apiary screen (mock-up screen 3): the yard's hive table, site notes, and
 * a summary panel for each other yard.
 */
export function ApiaryDetail({
  organizationId,
  apiaryId,
  onNavigate,
}: {
  organizationId: string;
  apiaryId: string;
  onNavigate: (request: PageRequest) => void;
}) {
  const apiaries = useResources(organizationId, 'apiary');
  const hives = useResources(organizationId, 'hive');
  const queens = useResources(organizationId, 'queen');
  const equipment = useResources(organizationId, 'equipmentBox');
  const inspections = useResources(organizationId, 'inspection');
  const miteCounts = useResources(organizationId, 'miteCount');
  const treatments = useResources(organizationId, 'treatmentEvent');
  const harvests = useResources(organizationId, 'harvest');

  const apiary = apiaries.find((record) => record.id === apiaryId);
  if (!apiary) {
    return (
      <>
        <div className="page-h">
          <h1>Apiary not found</h1>
        </div>
        <Empty text="This apiary is not in the local workspace." />
        <p>
          <button
            className="linkish"
            type="button"
            onClick={() => onNavigate({ page: 'apiaries' })}
          >
            ‹ All apiaries
          </button>
        </p>
      </>
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const latestInspection = latestInspectionByHive(inspections);
  const latestMite = latestMiteByHive(miteCounts);
  const harvestTotals = new Map(
    seasonHarvest(harvests, year, now).byHive.map((row) => [row.hiveId, row.quantity]),
  );
  const harvestUnit = seasonHarvest(harvests, year, now).unit;
  const hivesAt = (yardId: string) =>
    hives.filter((record) => String(record.data.apiaryId) === yardId);
  const yardHives = hivesAt(apiaryId);
  const activeCount = yardHives.filter((record) => record.data.status === 'active').length;
  const otherYards = apiaries.filter((record) => record.id !== apiaryId && !record.data.archivedAt);
  const latestYardInspection = yardHives
    .map((hive) => latestInspection.get(hive.id))
    .filter((record): record is LocalResource => Boolean(record))
    .sort((a, b) => String(b.data.inspectedAt).localeCompare(String(a.data.inspectedAt)))[0];

  const queenCell = (hive: LocalResource) => {
    const queen = currentQueen(queens, hive.id);
    if (!queen) return <span className="sub-t">—</span>;
    const mark = queenMark(queen.data);
    return (
      <>
        {mark && (
          <span className="qmark" style={{ background: mark.hex }} aria-hidden="true"></span>
        )}
        {String(queen.data.identifier)}
        {mark ? ` · ${mark.color}` : ''}
      </>
    );
  };

  const hiveRows = (rows: LocalResource[], showQueenStack: boolean) =>
    rows.map((hive) => {
      const status = hiveStatusTag(hive, treatments, now.toISOString());
      const inspection = latestInspection.get(hive.id);
      const harvestQuantity = harvestTotals.get(hive.id);
      return (
        <tr key={hive.id}>
          <td>
            <button
              className="row-link"
              type="button"
              onClick={() => onNavigate({ page: 'hive', hiveId: hive.id })}
            >
              {String(hive.data.name)}
            </button>
          </td>
          {showQueenStack && <td>{queenCell(hive)}</td>}
          {showQueenStack && <td className="num">{stackCount(equipment, hive.id) || '—'}</td>}
          <td>
            {inspection ? (
              new Date(String(inspection.data.inspectedAt)).toLocaleDateString()
            ) : (
              <span className="sub-t">n/a</span>
            )}
          </td>
          <td className="num">{formatMiteReading(latestMite.get(hive.id))}</td>
          <td className="num">
            {harvestQuantity !== undefined ? (
              `${harvestQuantity} ${harvestUnit ?? ''}`.trim()
            ) : (
              <span className="sub-t">—</span>
            )}
          </td>
          <td>
            <span className={`tag ${status.tone}`}>{status.label}</span>
          </td>
        </tr>
      );
    });

  return (
    <>
      <div className="page-h">
        <h1>{String(apiary.data.name)}</h1>
        <span className="sub">
          {apiary.data.location ? `${String(apiary.data.location)} · ` : ''}
          {yardHives.length} hive{yardHives.length === 1 ? '' : 's'} ({activeCount} active)
        </span>
      </div>

      <div className="grid g2">
        <div className="panel">
          <div className="panel-h">
            <h2>Hives at this yard</h2>
            <span className="spacer"></span>
            <button className="linkish" type="button" onClick={() => onNavigate({ page: 'hives' })}>
              Add hive ›
            </button>
          </div>
          {yardHives.length === 0 ? (
            <div className="panel-b">
              <Empty text="No hives recorded at this yard yet." />
            </div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hive</th>
                    <th>Queen</th>
                    <th className="num">Stack</th>
                    <th>Last insp.</th>
                    <th className="num">Mites</th>
                    <th className="num">Harvest</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>{hiveRows(yardHives, true)}</tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="panel">
            <div className="panel-h">
              <h2>Site notes</h2>
              <span className="spacer"></span>
              <button
                className="linkish"
                type="button"
                onClick={() => onNavigate({ page: 'apiaries' })}
              >
                Edit ›
              </button>
            </div>
            <div className="panel-b">
              <dl className="kv">
                {apiary.data.location ? (
                  <>
                    <dt>Location</dt>
                    <dd>{String(apiary.data.location)}</dd>
                  </>
                ) : null}
                {apiary.data.accessNotes ? (
                  <>
                    <dt>Access</dt>
                    <dd>{String(apiary.data.accessNotes)}</dd>
                  </>
                ) : null}
                {apiary.data.notes ? (
                  <>
                    <dt>Notes</dt>
                    <dd>{String(apiary.data.notes)}</dd>
                  </>
                ) : null}
                <dt>Conditions</dt>
                <dd>
                  {latestYardInspection
                    ? `${formatWeatherSummary(latestYardInspection.data.weather)} (inspection ${new Date(String(latestYardInspection.data.inspectedAt)).toLocaleDateString()})`
                    : 'No inspection conditions recorded yet'}
                </dd>
              </dl>
            </div>
          </div>

          {otherYards.map((yard) => {
            const rows = hivesAt(yard.id);
            return (
              <div className="panel" key={yard.id} style={{ marginTop: 14 }}>
                <div className="panel-h">
                  <h2>Other yard · {String(yard.data.name)}</h2>
                  <span className="spacer"></span>
                  <button
                    className="linkish"
                    type="button"
                    onClick={() => onNavigate({ page: 'apiary', apiaryId: yard.id })}
                  >
                    Open ›
                  </button>
                </div>
                {rows.length === 0 ? (
                  <div className="panel-note">
                    <span className="sub-t">No hives recorded at this yard.</span>
                  </div>
                ) : (
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Hive</th>
                          <th>Last insp.</th>
                          <th className="num">Mites</th>
                          <th className="num">Harvest</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>{hiveRows(rows, false)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
