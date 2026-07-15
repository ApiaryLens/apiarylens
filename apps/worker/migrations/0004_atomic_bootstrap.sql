CREATE TABLE bootstrap_claims (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  claimed_at TEXT NOT NULL
);

INSERT OR IGNORE INTO bootstrap_claims(singleton, claimed_at)
  SELECT 1, MIN(created_at) FROM memberships
  WHERE role = 'owner' AND status = 'active'
  HAVING COUNT(*) > 0;
