import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests, getDb, writeTransaction } from "@/server/db";
import {
  runMaintenance,
  verifyMaintenanceSecret,
} from "@/server/maintenance";
import { POST } from "@/app/api/internal/maintenance/route";

describe("Maintenance Route & Logic", () => {
  let directory: string;
  const SECRET = "very-secure-maintenance-secret-32-chars";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-maint-"));
    vi.stubEnv("TURSO_DATABASE_URL", "file:" + join(directory, "test.db"));
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    vi.stubEnv("BMO_APP_ORIGIN", "http://127.0.0.1:3000");
    vi.stubEnv("SESSION_SECRET", "synthetic-test-secret-at-least-32-characters");
    vi.stubEnv(
      "ADMIN_PASSWORD_HASH",
      "$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$c3ludGhldGlj",
    );
    vi.stubEnv("BMO_MAINTENANCE_SECRET", SECRET);
  });

  afterEach(async () => {
    await closeDbForTests();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("verifies maintenance secret correctly and rejects invalid headers", () => {
    expect(verifyMaintenanceSecret(`Bearer ${SECRET}`)).toBe(true);
    expect(verifyMaintenanceSecret(SECRET)).toBe(true);
    expect(verifyMaintenanceSecret("Bearer wrong-secret")).toBe(false);
    expect(verifyMaintenanceSecret("")).toBe(false);
    expect(verifyMaintenanceSecret(null)).toBe(false);
  });

  it("returns 401 on unauthorized POST request", async () => {
    const request = new Request("http://127.0.0.1:3000/api/internal/maintenance", {
      method: "POST",
      headers: { authorization: "Bearer invalid" },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("prunes expired nonces, receipts, sessions and marks expired reset windows unavailable", async () => {
    const db = await getDb();
    const now = Date.now();

    // Insert expired items
    await writeTransaction(async (tx) => {
      // Seed collector & key
      await tx.execute({
        sql: "INSERT INTO collectors(collector_id, name, created_at) VALUES('col-1', 'Col 1', ?)",
        args: [now],
      });
      await tx.execute({
        sql: "INSERT INTO collector_keys(key_id, collector_id, active_from) VALUES('key-1', 'col-1', ?)",
        args: [now],
      });
      // Expired nonce
      await tx.execute({
        sql: "INSERT INTO ingestion_nonces(key_id, nonce, accepted_at, expires_at) VALUES('key-1', 'nonce-1', ?, ?)",
        args: [now - 1000, now - 100],
      });
      // Expired receipt
      await tx.execute({
        sql: "INSERT INTO ingestion_receipts(collector_id, event_id, body_hash, provider_id, generation, sequence, outcome, received_at, expires_at) VALUES('col-1', 'evt-1', 'hash', 'codex', 1, 1, 'accepted', ?, ?)",
        args: [now - 1000, now - 100],
      });
      // Expired session
      await tx.execute({
        sql: "INSERT INTO admin_sessions(handle_hash, expires_at, created_at) VALUES('sess-1', ?, ?)",
        args: [now - 100, now - 1000],
      });

      // Window with reset in the past
      await tx.execute({
        sql: `INSERT INTO current_windows(provider_id, window_id, observation_id, payload, data_status)
              VALUES('codex', 'win-1', 'obs-1', ?, 'ok')`,
        args: [
          JSON.stringify({
            windowId: "win-1",
            resetAt: new Date(now - 1000).toISOString(),
          }),
        ],
      });
    });

    const request = new Request("http://127.0.0.1:3000/api/internal/maintenance", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.prunedNonces).toBe(1);
    expect(body.data.prunedReceipts).toBe(1);
    expect(body.data.prunedSessions).toBe(1);
    expect(body.data.staleTransitions).toBe(1);

    // Verify window was transitioned to unavailable
    const win = (
      await db.$client.execute(
        "SELECT data_status FROM current_windows WHERE provider_id='codex' AND window_id='win-1'",
      )
    ).rows[0];
    expect(win.data_status).toBe("unavailable");
  });
});
