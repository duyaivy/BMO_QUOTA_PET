import { GET as dashboardGET } from "@/app/api/dashboard/route";
import {
  GET as deviceGET,
  POST as devicePOST,
} from "@/app/api/devices/config/route";
import { POST as providerPOST } from "@/app/api/settings/providers/route";
import { enrollFixture } from "@/server/ingestion/enroll";
import { ingest } from "@/server/ingestion";
import { observation, signedRequest, FIXTURE_KEY } from "../fixtures/usage";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import argon2 from "argon2";
import { createHmac } from "node:crypto";

const store = vi.hoisted(() => ({
  values: new Map<string, { name: string; value: string }>(),
  options: new Map<string, Record<string, unknown>>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => store.values.get(name),
    getAll: () => Array.from(store.values.values()),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      store.options.set(name, options);
      if (options.maxAge === 0) store.values.delete(name);
      else store.values.set(name, { name, value });
    },
  }),
}));
import { GET as csrf } from "@/app/api/auth/csrf/route";
import { POST as signIn } from "@/app/api/auth/login/route";
import { POST as signOut } from "@/app/api/auth/logout/route";
import { getAdminSession, requireAdmin, login } from "@/server/auth";
import { closeDbForTests, getDb } from "@/server/db";

let directory: string;
let encoded: string;
function trustedSource(address = "192.0.2.1") {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return `${address};${timestamp};${createHmac("sha256", "a".repeat(64)).update(`BMO-CLIENT-V1\n${address}\n${timestamp}`).digest("hex")}`;
}
const origin = "http://127.0.0.1:3000";
function request(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "X-BMO-Trusted-Client": trustedSource(),
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function credentials(password = "synthetic-owner-password") {
  const response = await csrf();
  expect(response.status).toBe(200);
  const { csrfToken } = await response.json();
  return { password, csrfToken };
}
beforeAll(async () => {
  encoded = await argon2.hash("synthetic-owner-password", {
    type: argon2.argon2id,
  });
});
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "bmo-auth-routes-"));
  vi.stubEnv("BMO_APP_ORIGIN", origin);
  vi.stubEnv("BMO_CLIENT_SOURCE_SECRET", "a".repeat(64));
  vi.stubEnv("TURSO_DATABASE_URL", `file:${join(directory, "test.db")}`);
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv(
    "SESSION_SECRET",
    "isolated-synthetic-session-secret-at-least-32-characters",
  );
  vi.stubEnv("ADMIN_PASSWORD_HASH", encoded);
  store.values.clear();
  store.options.clear();
  await closeDbForTests();
});
afterEach(async () => {
  await closeDbForTests();
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("auth HTTP boundaries with real seals and local libSQL", () => {
  it("checks the database on every access, rejects tampering, and revokes captured-cookie replay", async () => {
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
    expect(
      (await signIn(request("/api/auth/login", await credentials()))).status,
    ).toBe(200);
    expect(await getAdminSession()).not.toBeNull();
    const original = new Map(store.values);
    expect(store.options.get("bmo_owner")).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    const { csrfToken } = await (await csrf()).json();
    expect(
      (
        await signOut(
          request("/api/auth/logout", undefined, { "X-CSRF-Token": csrfToken }),
        )
      ).status,
    ).toBe(200);
    store.values.clear();
    for (const [key, value] of original) store.values.set(key, value);
    expect(await getAdminSession()).toBeNull();
    const cookie = store.values.get("bmo_owner")!;
    store.values.set("bmo_owner", {
      ...cookie,
      value: `${cookie.value}tampered`,
    });
    expect(await getAdminSession()).toBeNull();
  });
  it("expires sessions at the fixed database deadline", async () => {
    expect(
      (await signIn(request("/api/auth/login", await credentials()))).status,
    ).toBe(200);
    const db = await getDb();
    const rows = await db.$client.execute(
      "SELECT expires_at-created_at AS lifetime FROM admin_sessions",
    );
    expect(Number(rows.rows[0]?.lifetime)).toBe(8 * 60 * 60 * 1000);
    await db.$client.execute({
      sql: "UPDATE admin_sessions SET expires_at=?",
      args: [Date.now() - 1],
    });
    expect(await getAdminSession()).toBeNull();
  });
  it("rejects foreign/missing origins, missing CSRF, unknown fields and streamed oversized bodies", async () => {
    const data = await credentials();
    expect(
      (
        await signIn(
          request("/api/auth/login", data, {
            Origin: "https://attacker.invalid",
          }),
        )
      ).status,
    ).toBe(403);
    const missing = request("/api/auth/login", data);
    missing.headers.delete("Origin");
    expect((await signIn(missing)).status).toBe(403);
    expect(
      (
        await signIn(
          request("/api/auth/login", { ...data, csrfToken: "wrong" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await signIn(
          request("/api/auth/login", {
            ...data,
            providerToken: "forbidden-fixture",
          }),
        )
      ).status,
    ).toBe(400);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(" ".repeat(3000)));
        controller.close();
      },
    });
    const oversized = new Request(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Length": "1",
        "X-BMO-Trusted-Client": trustedSource(),
      },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await signIn(oversized)).status).toBe(400);
  });
  it("durably throttles failures across database client recreation and ignores spoofed IP headers", async () => {
    const data = await credentials("incorrect-fixture");
    for (let i = 0; i < 5; i++)
      expect((await signIn(request("/api/auth/login", data))).status).toBe(401);
    const otherSource = request("/api/auth/login", data, {
      "X-BMO-Trusted-Client": trustedSource("192.0.2.2"),
    });
    expect((await signIn(otherSource)).status).toBe(401);
    await closeDbForTests();
    expect(
      (
        await signIn(
          request("/api/auth/login", data, { "X-Forwarded-For": "192.0.2.55" }),
        )
      ).status,
    ).toBe(429);
  });
  it("admits two simultaneous valid logins without local writer collisions", async () => {
    const outcomes = await Promise.allSettled([
      login("synthetic-owner-password", "192.0.2.1"),
      login("synthetic-owner-password", "192.0.2.2"),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect(
      (await (await getDb()).$client.execute("SELECT * FROM admin_sessions"))
        .rows,
    ).toHaveLength(2);
  });
  it("rejects unsigned or forged client source metadata", async () => {
    const data = await credentials();
    expect(
      (
        await signIn(
          request("/api/auth/login", data, {
            "X-BMO-Trusted-Client": "192.0.2.2;1234567890;" + "0".repeat(64),
          }),
        )
      ).status,
    ).toBe(403);
    const absent = request("/api/auth/login", data);
    absent.headers.delete("X-BMO-Trusted-Client");
    expect((await signIn(absent)).status).toBe(403);
  });
  it("fails closed with sanitized responses when configuration or database is unavailable", async () => {
    const data = await credentials();
    vi.stubEnv("ADMIN_PASSWORD_HASH", "invalid");
    expect((await csrf()).status).toBe(503);
    expect((await signIn(request("/api/auth/login", data))).status).toBe(503);
    vi.stubEnv("ADMIN_PASSWORD_HASH", encoded);
    expect((await signIn(request("/api/auth/login", data))).status).toBe(200);
    (await getDb()).$client.close();
    await expect(getAdminSession()).rejects.toThrow();
  });
});

async function signInForSettings() {
  expect(
    (await signIn(request("/api/auth/login", await credentials()))).status,
  ).toBe(200);
  return (await (await csrf()).json()).csrfToken as string;
}
it("rejects anonymous/collector identities and enforces CSRF on configuration mutations", async () => {
  expect((await dashboardGET()).status).toBe(401);
  expect((await deviceGET()).status).toBe(401);
  expect(
    (
      await devicePOST(
        request("/api/devices/config", {}, { "X-BMO-Key-Id": "fixture-key" }),
      )
    ).status,
  ).toBe(401);
  const token = await signInForSettings();
  expect((await devicePOST(request("/api/devices/config", {}))).status).toBe(
    403,
  );
  expect(
    (
      await providerPOST(
        request(
          "/api/settings/providers",
          {},
          { "X-CSRF-Token": token, Origin: "https://attacker.invalid" },
        ),
      )
    ).status,
  ).toBe(403);
});
it("persists PET-first ordering with atomic revision checks and rejects malformed settings", async () => {
  const token = await signInForSettings(),
    headers = { "X-CSRF-Token": token };
  const first = (await (await deviceGET()).json()).data;
  expect(first.screens).toEqual([{ kind: "pet", screenId: "pet-home" }]);
  const screens = [
    ...first.screens,
    {
      kind: "quota",
      screenId: "claude-screen",
      providerId: "claude",
      windowId: "missing.dynamic",
    },
    {
      kind: "quota",
      screenId: "codex-screen",
      providerId: "codex",
      windowId: "dynamic.bucket",
    },
  ];
  const input = {
    expectedRevision: first.revision,
    name: "Synthetic display",
    screens,
  };
  const saved = await devicePOST(
    request("/api/devices/config", input, headers),
  );
  expect(saved.status).toBe(200);
  expect((await (await deviceGET()).json()).data.screens).toEqual(screens);
  expect(
    (await devicePOST(request("/api/devices/config", input, headers))).status,
  ).toBe(409);
  expect(
    (
      await devicePOST(
        request(
          "/api/devices/config",
          { ...input, expectedRevision: 2, screens: [] },
          headers,
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await devicePOST(
        request(
          "/api/devices/config",
          { ...input, expectedRevision: 2, screens: [screens[1], screens[0]] },
          headers,
        ),
      )
    ).status,
  ).toBe(400);
  const reordered = [screens[0], screens[2], screens[1]];
  expect(
    (
      await devicePOST(
        request(
          "/api/devices/config",
          { ...input, expectedRevision: 2, screens: reordered },
          headers,
        ),
      )
    ).status,
  ).toBe(200);
  expect((await (await deviceGET()).json()).data).toMatchObject({
    revision: 3,
    screens: reordered,
  });
});
it("rolls device deletion/insertion and revision back on storage failure", async () => {
  const token = await signInForSettings();
  const initial = (await (await deviceGET()).json()).data,
    db = await getDb();
  await db.$client.executeMultiple(
    "CREATE TRIGGER device_fixture_failure BEFORE INSERT ON device_screens BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
  );
  expect(
    (
      await devicePOST(
        request(
          "/api/devices/config",
          {
            expectedRevision: initial.revision,
            name: "Should roll back",
            screens: initial.screens,
          },
          { "X-CSRF-Token": token },
        ),
      )
    ).status,
  ).toBe(503);
  await db.$client.execute("DROP TRIGGER device_fixture_failure");
  expect((await (await deviceGET()).json()).data).toEqual(initial);
});
it("reads synthetic persisted quota and changing provider preference does not freshen or erase it", async () => {
  const token = await signInForSettings();
  vi.stubEnv("BMO_ALLOW_FIXTURE_SETUP", "true");
  vi.stubEnv(
    "BMO_INGEST_KEYS_JSON",
    JSON.stringify({ "fixture-key": FIXTURE_KEY }),
  );
  const generation = await enrollFixture({
    collectorId: "fixture-collector",
    name: "Synthetic settings source",
    keyId: "fixture-key",
    providerId: "codex",
  });
  expect(
    (
      await ingest(
        signedRequest(observation({ ownershipGeneration: generation })),
      )
    ).status,
  ).toBe(200);
  const first = (await (await dashboardGET()).json()).data,
    provider = first.providers.find(
      (entry: { providerId: string }) => entry.providerId === "codex",
    );
  expect(provider.synthetic).toBe(true);
  expect(provider.windows[0].window.usedPercent).toBe(35);
  expect(
    (
      await providerPOST(
        request(
          "/api/settings/providers",
          {
            expectedRevision: first.settingsRevision,
            providerId: "codex",
            enabled: false,
          },
          { "X-CSRF-Token": token },
        ),
      )
    ).status,
  ).toBe(200);
  const second = (await (await dashboardGET()).json()).data,
    disabled = second.providers.find(
      (entry: { providerId: string }) => entry.providerId === "codex",
    );
  expect(disabled.enabled).toBe(false);
  expect(disabled.windows[0].availability).toBe("unavailable");
  expect(disabled.windows[0].window.collectedAt).toBe(
    provider.windows[0].window.collectedAt,
  );
  expect(
    (
      await providerPOST(
        request(
          "/api/settings/providers",
          {
            expectedRevision: first.settingsRevision,
            providerId: "codex",
            enabled: true,
          },
          { "X-CSRF-Token": token },
        ),
      )
    ).status,
  ).toBe(409);
});
