PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE memberships (
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

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE resources (
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

CREATE TABLE changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upsert', 'delete')),
  version INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  value_json TEXT
);
CREATE INDEX changes_by_org_sequence ON changes (organization_id, sequence);

CREATE TABLE idempotency (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  operation_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id, operation_id)
);

CREATE TABLE recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);
