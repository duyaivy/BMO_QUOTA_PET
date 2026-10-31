import {
  index,
  integer,
  primaryKey,
  real,
  uniqueIndex,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  revision: integer("revision").notNull().default(1),
  freshnessThresholdSeconds: integer("freshness_threshold_seconds")
    .notNull()
    .default(900),
  historyRetentionDays: integer("history_retention_days").notNull().default(7),
  updatedAt: integer("updated_at").notNull(),
});

export const providerConfig = sqliteTable("provider_config", {
  providerId: text("provider_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  verification: text("verification").notNull().default("unverified"),
  verificationNote: text("verification_note"),
  sourceType: text("source_type"),
  ownershipGeneration: integer("ownership_generation").notNull().default(1),
  authoritativeCollectorId: text("authoritative_collector_id").references(
    () => collectors.collectorId,
  ),
  completeSetVerified: integer("complete_set_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  latestSequence: integer("latest_sequence").notNull().default(0),
  lastCollectedAt: integer("last_collected_at"),
  dataStatus: text("data_status").notNull().default("unavailable"),
  errorCode: text("error_code"),
  updatedAt: integer("updated_at").notNull(),
});

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    handleHash: text("handle_hash").primaryKey(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("admin_sessions_expiry_idx").on(table.expiresAt)],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    windowStart: integer("window_start").notNull(),
    attempts: integer("attempts").notNull().default(0),
    blockedUntil: integer("blocked_until"),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.subjectHash, table.windowStart],
    }),
    index("rate_limits_expiry_idx").on(table.expiresAt),
  ],
);

export const collectors = sqliteTable("collectors", {
  collectorId: text("collector_id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  fixtureMode: integer("fixture_mode", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at"),
  lastQuotaCaptureAt: integer("last_quota_capture_at"),
  lastSourceEventAt: integer("last_source_event_at"),
});
export const collectorKeys = sqliteTable(
  "collector_keys",
  {
    keyId: text("key_id").primaryKey(),
    collectorId: text("collector_id")
      .notNull()
      .references(() => collectors.collectorId),
    activeFrom: integer("active_from").notNull(),
    validUntil: integer("valid_until"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [index("collector_keys_collector_idx").on(table.collectorId)],
);
export const quotaObservations = sqliteTable(
  "quota_observations",
  {
    observationId: text("observation_id").primaryKey(),
    collectorId: text("collector_id")
      .notNull()
      .references(() => collectors.collectorId),
    providerId: text("provider_id")
      .notNull()
      .references(() => providerConfig.providerId),
    eventId: text("event_id").notNull(),
    generation: integer("generation").notNull(),
    sequence: integer("sequence").notNull(),
    collectedAt: integer("collected_at").notNull(),
    upstreamObservedAt: integer("upstream_observed_at"),
    receivedAt: integer("received_at").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [
    uniqueIndex("quota_observations_event_unique").on(
      table.collectorId,
      table.eventId,
    ),
    uniqueIndex("quota_observations_sequence_unique").on(
      table.collectorId,
      table.providerId,
      table.generation,
      table.sequence,
    ),
    index("quota_observations_order_idx").on(
      table.providerId,
      table.generation,
      table.sequence,
    ),
    index("quota_observations_source_idx").on(
      table.providerId,
      table.upstreamObservedAt,
    ),
  ],
);
export const quotaWindows = sqliteTable(
  "quota_windows",
  {
    observationId: text("observation_id")
      .notNull()
      .references(() => quotaObservations.observationId),
    windowId: text("window_id").notNull(),
    usedPercent: real("used_percent"),
    remainingPercent: real("remaining_percent"),
    durationSeconds: integer("duration_seconds"),
    resetAt: integer("reset_at"),
    payload: text("payload").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.observationId, table.windowId] }),
    index("quota_windows_reset_idx").on(table.resetAt),
  ],
);
export const currentWindows = sqliteTable(
  "current_windows",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => providerConfig.providerId),
    windowId: text("window_id").notNull(),
    observationId: text("observation_id")
      .notNull()
      .references(() => quotaObservations.observationId),
    payload: text("payload").notNull(),
    dataStatus: text("data_status").notNull(),
  },
  (table) => [primaryKey({ columns: [table.providerId, table.windowId] })],
);
export const ingestionReceipts = sqliteTable(
  "ingestion_receipts",
  {
    collectorId: text("collector_id")
      .notNull()
      .references(() => collectors.collectorId),
    eventId: text("event_id").notNull(),
    bodyHash: text("body_hash").notNull(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providerConfig.providerId),
    generation: integer("generation").notNull(),
    sequence: integer("sequence").notNull(),
    observationId: text("observation_id").references(
      () => quotaObservations.observationId,
    ),
    outcome: text("outcome").notNull(),
    receivedAt: integer("received_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.collectorId, table.eventId] }),
    index("ingestion_receipts_expiry_idx").on(table.expiresAt),
  ],
);
export const ingestionNonces = sqliteTable(
  "ingestion_nonces",
  {
    keyId: text("key_id")
      .notNull()
      .references(() => collectorKeys.keyId),
    nonce: text("nonce").notNull(),
    acceptedAt: integer("accepted_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keyId, table.nonce] }),
    index("ingestion_nonces_expiry_idx").on(table.expiresAt),
  ],
);
export const operationalState = sqliteTable("operational_state", {
  resource: text("resource").primaryKey(),
  updatedAt: integer("updated_at").notNull(),
  lastCode: text("last_code"),
});

export const devices = sqliteTable("devices", {
  deviceId: text("device_id").primaryKey(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  configRevision: integer("config_revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});
export const deviceScreens = sqliteTable(
  "device_screens",
  {
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.deviceId),
    screenId: text("screen_id").notNull(),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    providerId: text("provider_id").references(() => providerConfig.providerId),
    windowId: text("window_id"),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.screenId] }),
    uniqueIndex("device_screens_position_unique").on(
      table.deviceId,
      table.position,
    ),
  ],
);
