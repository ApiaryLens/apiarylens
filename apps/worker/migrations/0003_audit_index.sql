CREATE INDEX IF NOT EXISTS audit_events_by_organization_created_at
  ON audit_events (organization_id, created_at);
