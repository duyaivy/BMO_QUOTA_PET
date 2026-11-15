import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import argon2 from "argon2";
import { closeDbForTests } from "@/server/db";
import { saveWeatherLocation } from "@/server/weather/settings";
import { MockMqttBroker } from "../fixtures/mqtt-broker";

describe("weather production HTTP boundary", () => {
  let directory: string;
  let origin: string;
  let child: ChildProcess | undefined;
  let broker: MockMqttBroker;
  let output = "";
  const token = "synthetic-weather-http-token";
  const cookieJar = new Map<string, string>();
  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (cookieJar.size)
      headers.set(
        "cookie",
        [...cookieJar].map(([key, value]) => `${key}=${value}`).join("; "),
      );
    const response = await fetch(origin + path, {
      ...init,
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const entry = cookie.split(";")[0];
      cookieJar.set(
        entry.slice(0, entry.indexOf("=")),
        entry.slice(entry.indexOf("=") + 1),
      );
    }
    return response;
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "bmo-weather-http-"));
    const portProbe = createServer();
    portProbe.listen(0, "127.0.0.1");
    await once(portProbe, "listening");
    const address = portProbe.address();
    if (!address || typeof address === "string")
      throw new Error("Fixture port unavailable");
    origin = `http://127.0.0.1:${address.port}`;
    await new Promise<void>((resolveClose) =>
      portProbe.close(() => resolveClose()),
    );
    broker = new MockMqttBroker();
    const brokerPort = await broker.start();
    const env = {
      BMO_APP_ORIGIN: origin,
      TURSO_DATABASE_URL: "file:" + join(directory, "test.db"),
      TURSO_AUTH_TOKEN: "",
      BMO_ALLOW_LOCAL_DATABASE: "true",
      BMO_INGEST_KEYS_JSON: "{}",
      SESSION_SECRET: "isolated-http-session-secret-at-least-32-characters",
      ADMIN_PASSWORD_HASH: await argon2.hash("weather-http-test-password", {
        type: argon2.argon2id,
      }),
      BMO_WEATHER_ENABLED: "true",
      BMO_WEATHER_DEVICE_IDS: '["bmo-local"]',
      BMO_WEATHER_TRIGGER_TOKEN_SHA256: createHash("sha256")
        .update(token)
        .digest("hex"),
      MQTT_HOST: "127.0.0.1",
      MQTT_PORT: String(brokerPort),
      MQTT_USE_TLS: "false",
      BMO_WEATHER_FIXTURE_LOG: join(directory, "provider.log"),
    };
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    await saveWeatherLocation(
      { expectedRevision: 1, locationId: 12 },
      async () => ({
        provider: "open-meteo",
        id: 12,
        name: "Đà Nẵng",
        admin1: "Miền Trung",
        country: "Việt Nam",
        countryCode: "VN",
        latitude: 16.06,
        longitude: 108.22,
        timezone: "Asia/Ho_Chi_Minh",
      }),
    );
    await closeDbForTests();
    child = spawn(
      process.execPath,
      [
        "--import",
        resolve("tests/fixtures/weather-fetch-preload.mjs"),
        "--import",
        "tsx",
        "scripts/serve.ts",
        "--port",
        String(address.port),
      ],
      {
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    for (const stream of [child.stdout, child.stderr])
      stream?.on("data", (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-8192);
      });
    await vi.waitFor(
      async () => {
        if (child?.exitCode !== null)
          throw new Error(`Fixture failed: ${output}`);
        expect((await request("/api/auth/csrf")).status).toBe(200);
      },
      { timeout: 20_000, interval: 100 },
    );
  }, 30_000);
  afterAll(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child?.kill("SIGKILL"), 6000);
      try {
        await closed;
      } finally {
        clearTimeout(timer);
      }
    }
    await broker?.stop();
    await closeDbForTests();
    if (directory) await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("authenticates real HEAD requests, publishes once and rejects duplicate fetching", async () => {
    const denied = await request("/api/internal/weather/refresh", {
      method: "HEAD",
    });
    expect(denied.status).toBe(401);
    expect(await denied.text()).toBe("");
    const headers = { authorization: `Bearer ${token}` };
    const first = await request("/api/internal/weather/refresh", {
      method: "HEAD",
      headers,
    });
    expect(first.status).toBe(200);
    expect(await first.text()).toBe("");
    expect(first.headers.get("X-BMO-Weather-Result")).toBe("updated");
    expect(first.headers.get("Cache-Control")).toContain("no-store");
    const second = await request("/api/internal/weather/refresh", {
      method: "HEAD",
      headers,
    });
    expect(second.headers.get("X-BMO-Weather-Result")).toBe("not_due");
    expect(await second.text()).toBe("");
    const manual = await request("/api/internal/weather/refresh", { headers });
    expect((await manual.json()).data.status).toBe("not_due");
    const calls = (await readFile(join(directory, "provider.log"), "utf8"))
      .trim()
      .split("\n");
    expect(calls.filter((kind) => kind === "weather")).toHaveLength(1);
    const message = broker.retainedMessages.get(
      "bmo/v1/devices/bmo-local/weather",
    );
    expect(JSON.parse(message!.payload.toString())).toMatchObject({
      status: "ok",
      temperatureC: 28,
    });
  });

  it("protects search/settings with owner session, CSRF and revision checks over HTTP", async () => {
    expect((await request("/api/weather/locations?q=Danang")).status).toBe(401);
    const csrf = (await (await request("/api/auth/csrf")).json()) as {
      csrfToken: string;
    };
    expect(
      (
        await request("/api/auth/login", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({
            password: "weather-http-test-password",
            csrfToken: csrf.csrfToken,
          }),
        })
      ).status,
    ).toBe(200);
    const freshCsrf = (await (await request("/api/auth/csrf")).json()) as {
      csrfToken: string;
    };
    const choices = await (
      await request("/api/weather/locations?q=Danang")
    ).json();
    expect(choices.data.map((choice: { id: number }) => choice.id)).toEqual([
      12, 13,
    ]);
    const mutation = (body: object, csrfToken?: string) =>
      request("/api/settings/weather", {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify(body),
      });
    expect(
      (await mutation({ expectedRevision: 2, locationId: 13 })).status,
    ).toBe(403);
    expect(
      (
        await mutation(
          { expectedRevision: 1, locationId: 13 },
          freshCsrf.csrfToken,
        )
      ).status,
    ).toBe(409);
    const saved = await mutation(
      { expectedRevision: 2, locationId: 13 },
      freshCsrf.csrfToken,
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toMatchObject({
      revision: 3,
      location: { id: 13 },
    });
    expect(
      (await (await request("/api/settings/weather")).json()).data.location.id,
    ).toBe(13);
  });
});
