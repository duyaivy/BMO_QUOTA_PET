import "server-only";
import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db";
import { readSettings } from "@/server/db/settings";
import { readDevice } from "@/server/devices/repository";
import {
  collectorHealthSchema,
  windowSchema,
  type UsageEvent,
} from "@/contracts/usage";
import type {
  DashboardSnapshot,
  DataStatus,
  ProviderView,
  CollectorView,
} from "@/contracts/dashboard";
const names = {
  codex: "Codex",
  claude: "Claude Code",
  antigravity: "Antigravity",
};
const status = (value: unknown): DataStatus =>
  ["ok", "unavailable", "unsupported", "error"].includes(String(value))
    ? (value as DataStatus)
    : "error";
const nullableNumber = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);
export async function readDashboard(): Promise<DashboardSnapshot> {
  await requireAdmin();
  const db = await getDb(),
    settings = await readSettings();
  const providerRows = (
    await db.$client.execute(
      "SELECT * FROM provider_config ORDER BY CASE provider_id WHEN 'codex' THEN 0 WHEN 'claude' THEN 1 ELSE 2 END",
    )
  ).rows;
  const collectorRows = (
    await db.$client.execute("SELECT * FROM collectors ORDER BY collector_id")
  ).rows;
  const healthRows = (
    await db.$client.execute(
      "SELECT h.* FROM collector_health h JOIN provider_config p ON p.provider_id=h.provider_id AND p.authoritative_collector_id=h.collector_id AND p.ownership_generation=h.generation ORDER BY h.provider_id",
    )
  ).rows;
  const current = (
    await db.$client.execute(
      "SELECT w.*,o.collector_id FROM current_windows w JOIN quota_observations o ON o.observation_id=w.observation_id",
    )
  ).rows;
  const windows = current.map((row) => ({
    providerId: String(row.provider_id),
    collectorId: String(row.collector_id),
    availability: status(row.data_status),
    window: windowSchema.parse(JSON.parse(String(row.payload))),
  }));
  const providers: ProviderView[] = [];
  for (const row of providerRows) {
    const providerId = row.provider_id as keyof typeof names;
    const latest = (
      await db.$client.execute({
        sql: "SELECT payload FROM quota_observations WHERE provider_id=? AND generation=? ORDER BY sequence DESC LIMIT 1",
        args: [providerId, Number(row.ownership_generation)],
      })
    ).rows[0];
    const event = latest
      ? (JSON.parse(String(latest.payload)) as UsageEvent)
      : null;
    const owner = collectorRows.find(
      (collector) => collector.collector_id === row.authoritative_collector_id,
    );
    const available = Boolean(row.enabled)
      ? status(row.data_status)
      : "unavailable";
    providers.push({
      providerId,
      name: names[providerId],
      enabled: Boolean(row.enabled),
      verification: row.verification as ProviderView["verification"],
      verificationNote:
        row.verification_note === null ? null : String(row.verification_note),
      sourceType: row.source_type === null ? null : String(row.source_type),
      ownershipGeneration: Number(row.ownership_generation),
      collectorId:
        row.authoritative_collector_id === null
          ? null
          : String(row.authoritative_collector_id),
      dataStatus: available,
      errorCode: row.error_code === null ? null : String(row.error_code),
      sourceAvailability: event?.sourceAvailability ?? "unavailable",
      synthetic: Boolean(owner?.fixture_mode),
      windows: windows
        .filter((window) => window.providerId === providerId)
        .map(({ window, availability }) => ({
          window,
          availability: available === "ok" ? availability : available,
        })),
    });
  }
  const collectors: CollectorView[] = collectorRows.map((row) => {
    const captures = windows
      .filter(
        (window) =>
          window.collectorId === row.collector_id &&
          window.window.dataStatus === "ok",
      )
      .map((window) => Date.parse(window.window.collectedAt));
    return {
      collectorId: String(row.collector_id),
      name: String(row.name),
      active: Boolean(row.active),
      synthetic: Boolean(row.fixture_mode),
      lastSeenAt: nullableNumber(row.last_seen_at),
      lastSourceEventAt: nullableNumber(row.last_source_event_at),
      lastObservationCaptureAt: nullableNumber(row.last_quota_capture_at),
      lastQuotaCaptureAt: captures.length ? Math.max(...captures) : null,
      healthReports: healthRows
        .filter((h) => h.collector_id === row.collector_id)
        .map((h) => {
          const payload = JSON.parse(String(h.payload));
          return {
            providerId: String(h.provider_id) as keyof typeof names,
            collectedAt: Number(h.collected_at),
            sourceAvailability: String(payload.sourceAvailability),
            sourceVersion:
              payload.sourceVersion === null
                ? null
                : String(payload.sourceVersion),
            health: collectorHealthSchema.parse(payload.health),
          };
        }),
    };
  });
  return {
    generatedAt: Date.now(),
    settingsRevision: settings.revision,
    freshnessThresholdSeconds: settings.freshnessThresholdSeconds,
    providers,
    collectors,
    device: await readDevice(),
  };
}
