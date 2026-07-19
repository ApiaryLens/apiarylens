import type { LocalResource } from '../../db.js';
import { Empty } from '../../components/Empty.js';
import { stackEntries } from './hive-stack.js';

/**
 * FB-009 — the visual + text equipment stack. The schematic silhouettes the
 * physical hive bottom-to-top (engineering-drawing flavor from the V2
 * mock-up); the numbered table beside it is the text alternative and carries
 * the detail. Both render from the same stackEntries selector so they can
 * never disagree.
 */
export function HiveStack({ equipment, hiveId }: { equipment: LocalResource[]; hiveId: string }) {
  const entries = stackEntries(equipment, hiveId);
  if (entries.length === 0)
    return <Empty text="No equipment recorded for this hive yet. Record its stack under Hives." />;
  return (
    <div className="stack-cols">
      <div
        className="schematic"
        role="img"
        aria-label={`Schematic stack of ${entries.length} component${entries.length === 1 ? '' : 's'}, listed bottom to top in the adjacent table`}
      >
        {entries.map((entry) => (
          <div key={entry.key} className={`sbox ${entry.silhouette}`} title={entry.name}>
            {entry.boxLabel}
          </div>
        ))}
      </div>
      <div className="tbl-wrap">
        <table className="stack-tbl" aria-label="Stack components bottom to top">
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.key}>
                <td>{entry.position}</td>
                <td>{entry.name}</td>
                <td className="sub-t">{entry.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
