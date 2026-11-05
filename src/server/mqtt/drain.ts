import "server-only";
import { randomUUID } from "node:crypto";
import { writeTransaction } from "@/server/db";
import { MqttClient } from "./publisher";

export interface DrainOptions {
  batchSize?: number;
  publisher?: MqttClient;
  nowMs?: number;
  leaseDurationMs?: number;
}

export interface DrainResult {
  drained: number;
  published: number;
  failed: number;
  leaseAcquired: boolean;
  errors: string[];
}

export async function drainOutbox(
  options: DrainOptions = {},
): Promise<DrainResult> {
  const now = options.nowMs ?? Date.now();
  const batchSize = options.batchSize ?? 10;
  const leaseDurationMs = options.leaseDurationMs ?? 15000;
  const workerToken = `worker-${randomUUID()}`;

  // Step 1: Attempt to acquire lease atomically
  const leaseAcquired = await writeTransaction(async (tx) => {
    // Check expired lease or unowned
    const row = (
      await tx.execute({
        sql: "SELECT lease_owner, lease_expires_at, generation FROM operational_state WHERE resource='mqtt_outbox_drain'",
      })
    ).rows[0];

    if (row) {
      const expiresAt = Number(row.lease_expires_at ?? 0);
      if (expiresAt > now) {
        // Lease is currently active
        return false;
      }
      // Lease expired, take over
      const updated = await tx.execute({
        sql: "UPDATE operational_state SET lease_owner=?, lease_expires_at=?, generation=generation+1, updated_at=? WHERE resource='mqtt_outbox_drain' AND (lease_expires_at <= ? OR lease_expires_at IS NULL)",
        args: [workerToken, now + leaseDurationMs, now, now],
      });
      return updated.rowsAffected > 0;
    } else {
      // Create initial row
      await tx.execute({
        sql: "INSERT INTO operational_state(resource, updated_at, last_code, lease_owner, lease_expires_at, generation) VALUES('mqtt_outbox_drain', ?, 'IDLE', ?, ?, 1)",
        args: [now, workerToken, now + leaseDurationMs],
      });
      return true;
    }
  });

  if (!leaseAcquired) {
    return {
      drained: 0,
      published: 0,
      failed: 0,
      leaseAcquired: false,
      errors: [],
    };
  }

  const publisher = options.publisher ?? new MqttClient();
  const errors: string[] = [];
  let publishedCount = 0;
  let failedCount = 0;

  try {
    // Step 2: Recover abandoned in_flight messages (crashed worker recovery)
    await writeTransaction(async (tx) => {
      await tx.execute({
        sql: "UPDATE mqtt_outbox SET state='failed', next_attempt_at=?, updated_at=? WHERE state='in_flight' AND updated_at < ?",
        args: [now, now, now - 30000],
      });
    });

    // Step 3: Fetch due messages and mark in_flight
    const candidateRows = await writeTransaction(async (tx) => {
      const rows = (
        await tx.execute({
          sql: "SELECT id, device_id, topic, revision, payload, is_tombstone, attempts FROM mqtt_outbox WHERE state IN ('pending', 'failed') AND next_attempt_at <= ? ORDER BY next_attempt_at ASC, revision ASC LIMIT ?",
          args: [now, batchSize],
        })
      ).rows;

      for (const row of rows) {
        await tx.execute({
          sql: "UPDATE mqtt_outbox SET state='in_flight', updated_at=? WHERE id=?",
          args: [now, String(row.id)],
        });
      }
      return rows;
    });

    // Step 4: Publish each message
    for (const row of candidateRows) {
      const id = String(row.id);
      const topic = String(row.topic);
      const payload = String(row.payload);
      const isTombstone = Boolean(row.is_tombstone);
      const attempts = Number(row.attempts ?? 0);

      try {
        await publisher.publish({
          topic,
          payload: isTombstone ? Buffer.alloc(0) : payload,
          qos: 1,
          retain: true,
        });

        // Mark published
        await writeTransaction(async (tx) => {
          await tx.execute({
            sql: "UPDATE mqtt_outbox SET state='published', acknowledged_at=?, updated_at=? WHERE id=?",
            args: [Date.now(), Date.now(), id],
          });
        });
        publishedCount++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to publish message ${id} to ${topic}: ${errMsg}`);
        failedCount++;

        const nextAttempts = attempts + 1;
        // Exponential backoff: 1s, 2s, 4s, 8s, up to 5 min + jitter
        const delayMs = Math.min(
          300000,
          1000 * Math.pow(2, nextAttempts) + Math.floor(Math.random() * 500),
        );
        const nextAttemptAt = Date.now() + delayMs;

        await writeTransaction(async (tx) => {
          await tx.execute({
            sql: "UPDATE mqtt_outbox SET state='failed', attempts=?, next_attempt_at=?, last_error=?, updated_at=? WHERE id=?",
            args: [nextAttempts, nextAttemptAt, errMsg, Date.now(), id],
          });
        });
      }
    }

    return {
      drained: candidateRows.length,
      published: publishedCount,
      failed: failedCount,
      leaseAcquired: true,
      errors,
    };
  } finally {
    // Release lease
    await writeTransaction(async (tx) => {
      await tx.execute({
        sql: "UPDATE operational_state SET lease_owner=NULL, lease_expires_at=0, updated_at=? WHERE resource='mqtt_outbox_drain' AND lease_owner=?",
        args: [Date.now(), workerToken],
      });
    });
  }
}
