// Explicit, disposable acceptance check. Observes new ordinary-session records;
// never starts a provider session or reads a provider credential store.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import argon2 from "argon2";
import { chromium } from "@playwright/test";
import { FixtureCollector, type CollectorConfig } from "../collector/src/index";
import { codexObserver } from "../collector/src/native-codex";
import { sampleHealth } from "../collector/src/health";
const execute = promisify(execFile);
async function main() {
  const [sourceDirectory] = process.argv.slice(2);
  if (!sourceDirectory) throw new Error("EXPLICIT_SESSION_DIRECTORY_REQUIRED");
  const directory = await mkdtemp(join(tmpdir(), "bmo-real-codex-"));
  const origin = "http://127.0.0.1:3102";
  const secret = randomBytes(32).toString("hex");
  const password = randomBytes(32).toString("hex");
  const env = {
    ...process.env,
    TURSO_DATABASE_URL: `file:${join(directory, "cloud.db")}`,
    TURSO_AUTH_TOKEN: "",
    BMO_APP_ORIGIN: origin,
    BMO_ALLOW_LOCAL_DATABASE: "true",
    BMO_ALLOW_NATIVE_SETUP: "true",
    BMO_ALLOW_FIXTURE_SETUP: "false",
    BMO_INGEST_KEYS_JSON: JSON.stringify({ "native-check-key": secret }),
    SESSION_SECRET: randomBytes(48).toString("hex"),
    ADMIN_PASSWORD_HASH: await argon2.hash(password, { type: argon2.argon2id }),
  };
  let server: ReturnType<typeof spawn> | undefined;
  let collector: FixtureCollector | undefined;
  try {
    await execute(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "scripts/db-migrate.ts"],
      { env, timeout: 15000 },
    );
    const enrolled = await execute(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "scripts/enroll-native.ts",
        "native-check",
        "native-check-key",
        "codex",
      ],
      { env, timeout: 15000 },
    );
    const generation = JSON.parse(enrolled.stdout)
      .ownershipGeneration as number;
    const secretFile = join(directory, "bmo.key");
    await writeFile(secretFile, secret, { mode: 0o600 });
    const config: CollectorConfig = {
      evidenceMode: "native",
      collectorId: "native-check",
      keyId: "native-check-key",
      secretFile,
      url: origin + "/api/internal/usage/ingest",
      stateDirectory: join(directory, "collector"),
      allowLocalHttp: true,
      providers: { codex: { enabled: true, generation } },
      nativeCodex: {
        sessionDirectory: resolve(sourceDirectory),
        version: "0.163.0",
      },
    };
    collector = await FixtureCollector.open(config);
    const observer = codexObserver(config, collector);
    await observer.scan();
    process.stdout.write("BASELINE_ESTABLISHED_WAITING_FOR_NORMAL_ACTIVITY\n");
    server = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/serve.ts", "--port", "3102"],
      { env, stdio: "ignore" },
    );
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin + "/api/auth/csrf")).ok) break;
      } catch {}
      await sleep(200);
    }
    const deadline = Date.now() + 90000;
    let event;
    while (Date.now() < deadline) {
      await observer.scan();
      event = (await collector.pendingEvents()).find(
        (e) => e.kind === "observation" && e.dataStatus === "ok",
      );
      if (event) break;
      await sleep(1000);
    }
    if (!event || event.kind !== "observation")
      throw new Error("NO_NEW_ORDINARY_QUOTA_RECORD");
    if ((await collector.uploadOnce()).code !== "ACKNOWLEDGED")
      throw new Error("NATIVE_UPLOAD_NOT_ACKNOWLEDGED");
    await collector.healthHeartbeat(
      "codex",
      await sampleHealth(collector, undefined, "ACKNOWLEDGED", "OK"),
      "available",
      event.sourceVersion,
    );
    for (let i = 0; i < 16 && (await collector.inspect()).pending; i++)
      if ((await collector.uploadOnce()).code !== "ACKNOWLEDGED")
        throw new Error("NATIVE_HEALTH_NOT_ACKNOWLEDGED");
    const browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    });
    try {
      const page = await browser.newPage();
      const csrf = await (
        await page.request.get(origin + "/api/auth/csrf")
      ).json();
      const login = await page.request.post(origin + "/api/auth/login", {
        headers: { Origin: origin },
        data: { password, csrfToken: csrf.csrfToken },
      });
      if (login.status() !== 200) throw new Error("DASHBOARD_LOGIN_FAILED");
      await page.goto(origin);
      const card = page.getByRole("region", { name: "Codex quota" });
      await card.getByRole("progressbar").first().waitFor();
      const dashboard = await (
        await page.request.get(origin + "/api/dashboard")
      ).json();
      const provider = dashboard.data.providers.find(
        (p: { providerId: string }) => p.providerId === "codex",
      );
      if (
        !provider ||
        provider.synthetic ||
        !provider.windows.length ||
        provider.windows.some(
          (w: { window: { upstreamObservedAt: unknown } }) =>
            w.window.upstreamObservedAt !== null,
        )
      )
        throw new Error("DASHBOARD_EVIDENCE_INVALID");
      await page.goto(origin + "/collectors");
      await page
        .getByRole("region", { name: "codex collector health" })
        .getByText("Recent health report", { exact: true })
        .waitFor();
      const healthReport = dashboard.data.collectors[0]?.healthReports[0];
      if (!healthReport || healthReport.health.sourceCode !== "OK")
        throw new Error("NATIVE_HEALTH_INVALID");
      process.stdout.write(
        JSON.stringify({
          nativeQuotaCaptured: true,
          sourceVersion: event.sourceVersion,
          windows: provider.windows.length,
          upstreamFreshness: "unknown",
          synthetic: false,
          dashboard: "passed",
          health: "passed",
        }) + "\n",
      );
    } finally {
      await browser.close();
    }
  } finally {
    await collector?.close();
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise<void>((r) => server!.once("exit", () => r()));
    }
    await rm(directory, { recursive: true, force: true });
  }
}
void main().catch((e: unknown) => {
  process.stderr.write(
    (e instanceof Error && /^[A-Z_]+$/.test(e.message)
      ? e.message
      : "NATIVE_CHECK_FAILED") + "\n",
  );
  process.exitCode = 1;
});
