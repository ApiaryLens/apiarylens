export const migration0001 = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  checksum TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'beekeeper', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'revoked')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  token_hash TEXT NOT NULL UNIQUE,
  identifier TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('beekeeper', 'viewer')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  accepted_at TEXT
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE IF NOT EXISTS sign_in_attempts (
  identifier TEXT PRIMARY KEY COLLATE NOCASE,
  window_started_at TEXT NOT NULL,
  failure_count INTEGER NOT NULL,
  blocked_until TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (organization_id, entity_type, id)
);

CREATE TABLE IF NOT EXISTS changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upsert', 'delete')),
  version INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  value_json TEXT
);

CREATE INDEX IF NOT EXISTS changes_by_org_sequence
  ON changes (organization_id, sequence);

CREATE TABLE IF NOT EXISTS idempotency (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  operation_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id, operation_id)
);
`;

// Compose shipped the identity tables in its initial consolidated schema while the
// Cloudflare profile introduced them as migration 0002. Keep an explicit marker so
// both profiles report the same ordered migration history.
export const migration0002 = `SELECT 1;`;

export const migration0003 = `
CREATE INDEX IF NOT EXISTS audit_events_by_organization_created_at
  ON audit_events (organization_id, created_at);
`;

export const migration0004 = `
CREATE TABLE IF NOT EXISTS bootstrap_claims (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  claimed_at TEXT NOT NULL
);

INSERT OR IGNORE INTO bootstrap_claims(singleton, claimed_at)
  SELECT 1, MIN(created_at) FROM memberships
  WHERE role = 'owner' AND status = 'active'
  HAVING COUNT(*) > 0;
`;
