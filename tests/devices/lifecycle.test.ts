import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDbForTests, getDb } from "@/server/db";
import {
  createDevice,
  getDeviceProvisioningInfo,
  listDevices,
  readDevice,
  retireDevice,
  RevisionConflict,
  saveDevice,
} from "@/server/devices/repository";

describe("Device Lifecycle & Configuration", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-device-"));
    vi.stubEnv("TURSO_DATABASE_URL", "file:" + join(directory, "test.db"));
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    vi.stubEnv("BMO_APP_ORIGIN", "http://127.0.0.1:3000");
    vi.stubEnv(
      "SESSION_SECRET",
      "synthetic-test-secret-at-least-32-characters",
    );
    vi.stubEnv(
      "ADMIN_PASSWORD_HASH",
      "$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$c3ludGhldGlj",
    );
  });

  afterEach(async () => {
    await closeDbForTests();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("reads default bmo-local device and lists registered devices", async () => {
    const devices = await listDevices();
    expect(devices.length).toBeGreaterThanOrEqual(1);
    expect(devices.some((d) => d.deviceId === "bmo-local")).toBe(true);

    const bmo = await readDevice("bmo-local");
    expect(bmo.deviceId).toBe("bmo-local");
    expect(bmo.screens[0]).toEqual({ screenId: "pet-home", kind: "pet" });
  });

  it("creates a new device, saves configuration with optimistic revision, and detects conflict", async () => {
    const db = await getDb();

    // 1. Create new device
    const created = await createDevice({
      deviceId: "bmo-living-room",
      name: "Living Room BMO",
    });
    expect(created.deviceId).toBe("bmo-living-room");
    expect(created.revision).toBe(1);

    // 2. Save configuration successfully
    const saved = await saveDevice({
      deviceId: "bmo-living-room",
      expectedRevision: 1,
      name: "Living Room BMO Updated",
      screens: [
        { screenId: "pet-home", kind: "pet" },
        {
          screenId: "screen-codex",
          kind: "quota",
          providerId: "codex",
          windowId: "limit_5h",
        },
      ],
    });
    expect(saved.revision).toBe(2);
    expect(saved.screens).toHaveLength(2);

    // Verify outbox was populated with config and snapshot
    const outbox = (
      await db.$client.execute({
        sql: "SELECT topic, revision, state FROM mqtt_outbox WHERE device_id='bmo-living-room' ORDER BY revision ASC",
      })
    ).rows;
    expect(outbox.length).toBeGreaterThanOrEqual(2);

    // 3. Attempting save with stale revision (1 instead of 2) throws RevisionConflict
    await expect(
      saveDevice({
        deviceId: "bmo-living-room",
        expectedRevision: 1, // stale!
        name: "Conflict attempt",
        screens: [{ screenId: "pet-home", kind: "pet" }],
      }),
    ).rejects.toThrow(RevisionConflict);
  });

  it("retires device, disables it and enqueues retained tombstones to outbox", async () => {
    const db = await getDb();

    const retired = await retireDevice({
      deviceId: "bmo-local",
      expectedRevision: 1,
    });
    expect(retired.enabled).toBe(false);

    // Check device row
    const dev = (
      await db.$client.execute(
        "SELECT enabled, config_revision FROM devices WHERE device_id='bmo-local'",
      )
    ).rows[0];
    expect(dev.enabled).toBe(0);
    expect(dev.config_revision).toBe(2);

    // Check tombstones in outbox
    const tombstones = (
      await db.$client.execute(
        "SELECT topic, is_tombstone, payload FROM mqtt_outbox WHERE device_id='bmo-local' AND is_tombstone=1",
      )
    ).rows;
    expect(tombstones).toHaveLength(2);
    for (const t of tombstones) {
      expect(t.payload).toBe("");
    }
  });

  it("provides device provisioning info with zero secret leakage", () => {
    const info = getDeviceProvisioningInfo("bmo-desk");
    expect(info.deviceId).toBe("bmo-desk");
    expect(info.configTopic).toBe("bmo/v1/devices/bmo-desk/config");
    expect(info.snapshotTopic).toBe("bmo/v1/devices/bmo-desk/snapshot");
    expect(info.subscribeAcl).toBe("bmo/v1/devices/bmo-desk/#");
    expect(info.instructions).not.toContain("password");
    expect(info.instructions).not.toContain("secret");
  });
});
