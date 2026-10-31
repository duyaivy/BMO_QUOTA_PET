import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { FixtureCollector } from "../src/index.js";
import { signingInput } from "../../src/contracts/usage/index.js";
const fixture = (a: number, b: number) =>
  JSON.stringify({
    fixtureSchema: "claude-v1",
    quota_observed_at: "2026-10-31T00:00:00Z",
    rate_limits: { a: { used_percentage: a }, b: { used_percentage: b } },
  });
describe("durable collector", () => {
  it("preserves unchanged bucket times and persistent sequence across restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmo-"));
    const secret = join(dir, "secret");
    await writeFile(secret, "a".repeat(64));
    await chmod(secret, 0o600);
    const config = {
      collectorId: "fixture-collector",
      keyId: "fixture-key",
      secretFile: secret,
      url: "http://127.0.0.1:3000/api/internal/usage/ingest",
      stateDirectory: join(dir, "state"),
      allowLocalHttp: true,
      providers: { claude: { enabled: true, generation: 1 } },
    };
    let c = await FixtureCollector.open(config);
    expect(
      await c.capture("claude", fixture(10, 20), "2026-10-31T00:00:01.000Z"),
    ).toEqual({ code: "QUEUED", queued: true });
    const first = (await c.pendingEvents())[0];
    if (first.kind !== "observation") throw new Error();
    const bTime = first.windows.find((w) => w.windowId === "b")?.collectedAt;
    await c.uploadOnce(
      async () => new Response("temporary", { status: 503 }),
      Date.parse("2026-10-31T00:00:03.000Z"),
    );
    const secondCapture = await c.capture(
      "claude",
      fixture(11, 20),
      "2026-10-31T00:00:02.000Z",
    );
    expect(secondCapture).toEqual({ code: "QUEUED", queued: true });
    const second = (await c.pendingEvents())[1];
    if (second.kind !== "observation") throw new Error();
    expect(second.sequence).toBe(2);
    expect(second.windows.find((w) => w.windowId === "b")?.collectedAt).toBe(
      bTime,
    );
    expect(await c.inspect()).toMatchObject({ pending: 2 });
    await c.close();
    c = await FixtureCollector.open(config);
    expect((await c.pendingEvents()).map((e) => e.sequence)).toEqual([1, 2]);
    await c.close();
    await rm(dir, { recursive: true, force: true });
  });
  it("uses immutable event body with fresh HMAC nonce and accepts matching durable ack", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmo-"));
    const secret = join(dir, "secret");
    await writeFile(secret, "b".repeat(64));
    await chmod(secret, 0o600);
    const config = {
      collectorId: "fixture-collector",
      keyId: "fixture-key",
      secretFile: secret,
      url: "http://127.0.0.1:3000/api/internal/usage/ingest",
      stateDirectory: join(dir, "state"),
      allowLocalHttp: true,
      providers: { claude: { enabled: true, generation: 1 } },
    };
    const c = await FixtureCollector.open(config);
    await c.capture("claude", fixture(10, 20), "2026-10-31T00:00:01.000Z");
    let body = "",
      signature = "",
      nonce = "";
    const result = await c.uploadOnce(async (_url, init) => {
      body = String(init?.body);
      signature = String(new Headers(init?.headers).get("x-bmo-signature"));
      nonce = String(new Headers(init?.headers).get("x-bmo-nonce"));
      const event = JSON.parse(body);
      const expected = await import("node:crypto").then(
        ({ createHmac, createHash }) =>
          createHmac("sha256", Buffer.from("b".repeat(64), "hex"))
            .update(
              signingInput({
                keyId: "fixture-key",
                collectorId: "fixture-collector",
                timestamp: String(Math.floor(Date.now() / 1000)),
                nonce,
                eventId: event.eventId,
                bodyHash: createHash("sha256").update(body).digest("hex"),
              }),
            )
            .digest("hex"),
      );
      expect(signature).toBe(expected);
      return new Response(
        JSON.stringify({
          data: { eventId: event.eventId, outcome: "accepted" },
        }),
        { status: 200 },
      );
    });
    expect(result.code).toBe("ACKNOWLEDGED");
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(body).toContain("claude");
    expect(await c.pendingEvents()).toHaveLength(0);
    await c.close();
    await rm(dir, { recursive: true, force: true });
  });
});
