CREATE TABLE invitations (
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

CREATE TABLE sign_in_attempts (
  identifier TEXT PRIMARY KEY COLLATE NOCASE,
  window_started_at TEXT NOT NULL,
  failure_count INTEGER NOT NULL,
  blocked_until TEXT
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);
