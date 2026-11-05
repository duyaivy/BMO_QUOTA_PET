import "server-only";
import { timingSafeEqual } from "node:crypto";
import { writeTransaction } from "@/server/db";
import { drainOutbox, type DrainResult } from "@/server/mqtt/drain";
import { enqueueDeviceSnapshot } from "@/server/mqtt/outbox";

export interface MaintenanceResult {
  now: number;
  outbox: DrainResult;
  staleTransitions: number;
  prunedNonces: number;
  prunedReceipts: number;
  prunedSessions: number;
  prunedOutbox: number;
}

export function verifyMaintenanceSecret(authHeader: string | null): boolean {
  const expectedSecret =
    process.env.BMO_MAINTENANCE_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret) return false;

  let providedSecret = "";
  if (authHeader?.startsWith("Bearer ")) {
    providedSecret = authHeader.slice(7).trim();
  } else if (authHeader) {
    providedSecret = authHeader.trim();
  }

  if (!providedSecret) return false;

  const expectedBuf = Buffer.from(expectedSecret, "utf8");
  const providedBuf = Buffer.from(providedSecret, "utf8");

  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function runMaintenance(options?: {
  nowMs?: number;
}): Promise<MaintenanceResult> {
  const now = options?.nowMs ?? Date.now();

  // 1. Drain pending outbox work
  const outboxResult = await drainOutbox({ nowMs: now });

  // 2. Perform stale quota transitions (reset expiry)
  let staleTransitions = 0;
  await writeTransaction(async (tx) => {
    const expiredWindows = (
      await tx.execute({
        sql: `SELECT cw.provider_id, cw.window_id, cw.payload
              FROM current_windows cw
              WHERE cw.data_status = 'ok'`,
      })
    ).rows;

    const affectedProviders = new Set<string>();

    for (const row of expiredWindows) {
      try {
        const payload = JSON.parse(String(row.payload));
        if (payload.resetAt) {
          const resetMs = Date.parse(payload.resetAt);
          if (!Number.isNaN(resetMs) && now >= resetMs) {
            await tx.execute({
              sql: "UPDATE current_windows SET data_status='unavailable' WHERE provider_id=? AND window_id=?",
              args: [String(row.provider_id), String(row.window_id)],
            });
            staleTransitions++;
            affectedProviders.add(String(row.provider_id));
          }
        }
      } catch {
        // ignore
      }
    }

    // Enqueue updated snapshots for affected devices
    for (const providerId of affectedProviders) {
      const devices = (
        await tx.execute({
          sql: `SELECT DISTINCT d.device_id FROM devices d
                JOIN device_screens s ON s.device_id = d.device_id
                WHERE d.enabled = 1 AND s.provider_id = ?`,
          args: [providerId],
        })
      ).rows;
      for (const dev of devices) {
        await enqueueDeviceSnapshot(tx, String(dev.device_id), now);
      }
    }
  });

  // 3. Prune expired nonces, receipts, sessions, and old superseded outbox rows
  let prunedNonces = 0;
  let prunedReceipts = 0;
  let prunedSessions = 0;
  let prunedOutbox = 0;

  await writeTransaction(async (tx) => {
    const nonceRes = await tx.execute({
      sql: "DELETE FROM ingestion_nonces WHERE expires_at < ?",
      args: [now],
    });
    prunedNonces = nonceRes.rowsAffected;

    const receiptRes = await tx.execute({
      sql: "DELETE FROM ingestion_receipts WHERE expires_at < ?",
      args: [now],
    });
    prunedReceipts = receiptRes.rowsAffected;

    const sessionRes = await tx.execute({
      sql: "DELETE FROM admin_sessions WHERE expires_at < ?",
      args: [now],
    });
    prunedSessions = sessionRes.rowsAffected;

    // Prune acknowledged or superseded outbox entries older than 24 hours
    const outboxRes = await tx.execute({
      sql: "DELETE FROM mqtt_outbox WHERE state IN ('published', 'superseded') AND updated_at < ?",
      args: [now - 86400000],
    });
    prunedOutbox = outboxRes.rowsAffected;

    // Record operational status
    await tx.execute({
      sql: "INSERT INTO operational_state(resource, updated_at, last_code) VALUES('maintenance', ?, 'SUCCESS') ON CONFLICT(resource) DO UPDATE SET updated_at=excluded.updated_at, last_code=excluded.last_code",
      args: [now],
    });
  });

  return {
    now,
    outbox: outboxResult,
    staleTransitions,
    prunedNonces,
    prunedReceipts,
    prunedSessions,
    prunedOutbox,
  };
}
