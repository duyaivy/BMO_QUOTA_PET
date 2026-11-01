import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseAntigravity } from "../src/adapters/antigravity.js";
import { StatuslineSpool } from "../src/statusline-spool.js";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
const raw = (quota: unknown) =>
  JSON.stringify({
    quota,
    email: "owner@example.invalid",
    session_id: "private-session",
    transcript_path: "/private/session",
    quota_observed_at: "2030-01-01T00:00:00Z",
  });
it("normalizes labeled synthetic AGY buckets without inventing amount percentages or relative reset anchors", () => {
  const result = parseAntigravity(
    raw({
      "model.a": {
        remaining_fraction: 0.75,
        reset_time: "2030-01-01T01:00:00+01:00",
      },
      "model.b": { remaining_amount: 123, reset_in_seconds: 3600 },
      "model.c": { disabled: true, remaining_fraction: 1 },
    }),
  );
  expect(result).toMatchObject({
    status: "ok",
    observedAt: null,
    windows: [
      {
        windowId: "model.a",
        used: 25,
        duration: null,
        reset: "2030-01-01T00:00:00.000Z",
      },
      { windowId: "model.b", used: null, duration: null, reset: null },
      { windowId: "model.c", used: null, status: "unavailable", reset: null },
    ],
  });
  expect(JSON.stringify(result)).not.toMatch(
    /private|owner@example|remaining_amount|123/,
  );
});
it("keeps missing, malformed and disabled quota distinct", () => {
  expect(parseAntigravity("{}").status).toBe("unavailable");
  expect(parseAntigravity(raw({})).status).toBe("unavailable");
  expect(
    parseAntigravity(raw({ a: { remaining_fraction: 2, remaining_amount: 4 } }))
      .status,
  ).toBe("error");
  expect(parseAntigravity(raw({ a: { disabled: "true" } })).status).toBe(
    "error",
  );
  expect(
    parseAntigravity(raw({ "bad/id": { remaining_fraction: 1 } })).status,
  ).toBe("error");
  expect(
    parseAntigravity(raw({ a: { remaining_fraction: 0 } })).windows[0].used,
  ).toBe(100);
  expect(
    parseAntigravity(raw({ a: { disabled: true } })).windows[0],
  ).toMatchObject({ used: null, status: "unavailable" });
  expect(parseAntigravity("x".repeat(32769)).status).toBe("error");
});
it("spools both providers independently and keeps cached AGY callbacks deduplicated after restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bmo-agy-"));
  directories.push(dir);
  let spool = StatuslineSpool.open(join(dir, "state"));
  const quota = parseAntigravity(raw({ model: { remaining_fraction: 0.5 } }));
  expect(spool.enqueue("antigravity", "antigravity/1.4.9", quota).code).toBe(
    "QUEUED",
  );
  const packet = spool.pending()[0];
  expect(packet.providerId).toBe("antigravity");
  expect(packet.quota.windows[0].used).toBe(50);
  spool.acknowledge(packet.id);
  spool.close();
  spool = StatuslineSpool.open(join(dir, "state"));
  expect(spool.enqueue("antigravity", "antigravity/1.4.9", quota).code).toBe(
    "DUPLICATE",
  );
  expect(spool.enqueue("antigravity", "claude-code/2.1.299", quota).code).toBe(
    "INVALID_SOURCE_VERSION",
  );
  spool.close();
});

it("does not substitute AGY context tokens, costs or standalone credits for subscription quota", () => {
  const parsed = parseAntigravity(
    JSON.stringify({
      context_window: { used_percentage: 91, total_input_tokens: 123456 },
      cost: { total_usd: 4 },
      credits: { remaining_amount: 42 },
    }),
  );
  expect(parsed).toEqual({
    status: "unavailable",
    errorCode: "SOURCE_UNAVAILABLE",
    windows: [],
    observedAt: null,
  });
});
