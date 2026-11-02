CREATE TABLE mqtt_outbox (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(device_id),
  topic TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  payload TEXT NOT NULL,
  is_tombstone INTEGER NOT NULL DEFAULT 0 CHECK(is_tombstone IN (0,1)),
  semantic_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending', 'in_flight', 'published', 'failed', 'superseded')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(device_id, topic, revision)
);

CREATE INDEX mqtt_outbox_due_idx ON mqtt_outbox(state, next_attempt_at);
CREATE INDEX mqtt_outbox_device_topic_idx ON mqtt_outbox(device_id, topic);

ALTER TABLE operational_state ADD COLUMN lease_owner TEXT;
ALTER TABLE operational_state ADD COLUMN lease_expires_at INTEGER;
ALTER TABLE operational_state ADD COLUMN generation INTEGER DEFAULT 0;
