CREATE TABLE weather_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  location_json TEXT,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO weather_settings(id, revision, location_json, updated_at) VALUES(1, 1, NULL, 0);
--> statement-breakpoint
CREATE TABLE weather_cache (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  location_revision INTEGER NOT NULL DEFAULT 1,
  observation_json TEXT,
  data_at INTEGER,
  fetched_at INTEGER,
  last_job_at INTEGER,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at INTEGER,
  last_error_code TEXT
);
--> statement-breakpoint
INSERT INTO weather_cache(id, location_revision, next_attempt_at) VALUES(1, 1, 0);
--> statement-breakpoint
CREATE TABLE weather_topic_state (
  device_id TEXT PRIMARY KEY REFERENCES devices(device_id),
  revision INTEGER NOT NULL CHECK(revision > 0),
  semantic_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
