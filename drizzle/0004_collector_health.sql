CREATE TABLE collector_health (
  collector_id TEXT NOT NULL REFERENCES collectors(collector_id),
  provider_id TEXT NOT NULL REFERENCES provider_config(provider_id),
  generation INTEGER NOT NULL CHECK(generation > 0),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  collected_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (collector_id, provider_id)
);
