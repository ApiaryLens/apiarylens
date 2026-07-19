import { api } from '../api.js';
import type { LocalResource } from '../db.js';

export function SyncBadge({ state }: { state: LocalResource['syncState'] }) {
  // Local-only sessions show no per-record sync state (WEB-001): with no
  // cloud backend, "synced"/"not synced" would describe invisible plumbing.
  if (api.localOnlySession()) return null;
  return (
    <span className={`sync-badge ${state}`}>{state === 'pending' ? 'not synced' : state}</span>
  );
}
