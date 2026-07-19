// Client-core command and query surface for the local workspace. Feature UI
// imports this module; the Dexie local store, outbox, and sync engine behind
// it live in ./local and the pure policies in ./core (ADR 0020).
export {
  isRetryableSyncError,
  requiresSessionRefresh,
  SyncRequestError,
} from './core/sync-errors.js';
export { ApiaryLensDb, db, LOCAL_CHANGE_EVENT } from './local/database.js';
export {
  cacheSession,
  cachedSession,
  clearCachedSession,
  clearLocalWorkspace,
} from './local/session-cache.js';
export {
  pendingCount,
  queueCreate,
  queueDelete,
  queueUpdate,
  resolveConflict,
  stageImage,
} from './local/outbox.js';
export { lastLocalBackupAt, recordLocalBackup } from './local/backup-signal.js';
export { synchronize } from './local/sync.js';
export type { LocalMedia, LocalResource, OutboxItem, SyncState } from './local/types.js';
