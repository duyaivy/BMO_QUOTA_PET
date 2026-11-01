import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FixtureCollector, type CollectorConfig } from "../src/index.js";
import type { ParsedQuota } from "../src/adapters/parse.js";

let dir: string;
let collector: FixtureCollector;
let config: CollectorConfig;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "bmo-native-"));
  const secretFile = join(dir, "secret");
  await writeFile(secretFile, "b".repeat(64), { mode: 0o600 });
  config = {
    collectorId: "native-test",
    keyId: "native-key",
    secretFile,
    stateDirectory: join(dir, "state"),
    url: "http://127.0.0.1:3000/api/internal/usage/ingest",
    allowLocalHttp: true,
    providers: { codex: { enabled: true, generation: 1 } },
  };
  collector = await FixtureCollector.open(config);
});
afterEach(async () => {
  await collector.close();
  await rm(dir, { recursive: true, force: true });
});
const quota = (used: number): ParsedQuota => ({
  status: "ok",
  errorCode: null,
  observedAt: null,
  windows: [
    {
      windowId: "primary",
      label: "primary",
      duration: 18000,
      used,
      reset: null,
    },
  ],
});
function capture(used: number, recordAt: string, offset: number) {
  return collector.captureQuota("codex", quota(used), undefined, undefined, {
    sourceVersion: "codex-cli/0.163.0",
    recordAt,
    nativeCheckpoint: {
      streamId: "stream",
      cursor: { identity: "opaque", offset, discarding: false },
    },
  });
}
it("atomically retains a native checkpoint and dedup evidence across restart without inventing upstream time", async () => {
  const t = Date.now() - 60000;
  expect((await capture(25, new Date(t).toISOString(), 50)).code).toBe(
    "QUEUED",
  );
  const first = (await collector.pendingEvents())[0];
  expect(first).toMatchObject({
    sourceVersion: "codex-cli/0.163.0",
    upstreamObservedAt: null,
    freshnessBasis: "unknown",
    sourceFreshness: "unknown",
  });
  await collector.close();
  collector = await FixtureCollector.open(config);
  expect((await collector.nativeCheckpoint("codex", "stream"))?.offset).toBe(
    50,
  );
  expect((await capture(25, new Date(t + 1000).toISOString(), 100)).code).toBe(
    "DUPLICATE",
  );
  expect((await collector.nativeCheckpoint("codex", "stream"))?.offset).toBe(
    100,
  );
  expect((await collector.pendingEvents())[0].collectedAt).toBe(
    first.collectedAt,
  );
  expect((await capture(90, new Date(t - 1000).toISOString(), 150)).code).toBe(
    "OLDER_SOURCE_RECORD",
  );
  expect((await collector.pendingEvents())[0].eventId).toBe(first.eventId);
});
it("does not advance a native cursor or ordering when queue pressure prevents commit", async () => {
  await collector.close();
  collector = await FixtureCollector.open({ ...config, maxQueueBytes: 1 });
  expect((await capture(25, new Date().toISOString(), 50)).code).toBe(
    "QUEUE_FULL",
  );
  expect(await collector.nativeCheckpoint("codex", "stream")).toBeNull();
  await collector.close();
  collector = await FixtureCollector.open(config);
  expect(
    (await capture(25, new Date(Date.now() - 1000).toISOString(), 50)).code,
  ).toBe("QUEUED");
});
it("isolates native cursors and local ordering by ownership generation", async () => {
  await capture(25, new Date().toISOString(), 50);
  await collector.close();
  collector = await FixtureCollector.open({
    ...config,
    providers: { codex: { enabled: true, generation: 2 } },
  });
  expect(await collector.nativeCheckpoint("codex", "stream")).toBeNull();
  expect(
    (await capture(26, new Date(Date.now() - 1000).toISOString(), 50)).code,
  ).toBe("QUEUED");
});
