import type { LocalResource } from '../db.js';

export function SyncBadge({ state }: { state: LocalResource['syncState'] }) {
  return (
    <span className={`sync-badge ${state}`}>{state === 'pending' ? 'not synced' : state}</span>
  );
}
