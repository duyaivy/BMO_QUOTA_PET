import { test, expect } from "@playwright/test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { heartbeat, fixtureHealth, signedRequest } from "../fixtures/usage";
import { startFixtureApp } from "../fixtures/browser-app";
test.use({ baseURL: "http://127.0.0.1:3104" });
let stopApp: () => Promise<void>;
test.beforeAll(async () => {
  stopApp = await startFixtureApp(3104);
});
test.afterAll(async () => {
  await stopApp?.();
});
const execute = promisify(execFile);
test("native daemon health and labeled callback fixtures survive a foreground restart without changing quota age", async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), "bmo-health-http-"));
  try {
    const configFile = join(directory, "collector.json"),
      secretFile = join(directory, "bmo.key"),
      stateDirectory = join(directory, "state");
    await mkdir(stateDirectory, { mode: 0o700 });
    // A local version-only stand-in keeps infrastructure tests independent of
    // installed provider clients and never creates model activity.
    const bin = join(directory, "bin");
    await mkdir(bin, { mode: 0o700 });
    await writeFile(
      join(bin, "claude"),
      `#!/bin/sh
echo '2.1.299 (Claude Code)'
`,
      { mode: 0o700 },
    );
    await writeFile(
      join(bin, "codex"),
      `#!/bin/sh
echo 'codex-cli 0.999.0'
`,
      { mode: 0o700 },
    );
    await writeFile(secretFile, "b".repeat(64), { mode: 0o600 });
    await writeFile(
      configFile,
      JSON.stringify({
        evidenceMode: "native",
        collectorId: "fixture-collector",
        keyId: "fixture-key",
        secretFile,
        stateDirectory,
        url: "http://127.0.0.1:3104/api/internal/usage/ingest",
        allowLocalHttp: true,
        providers: {
          claude: { enabled: true, generation: 2 },
          codex: { enabled: true, generation: 2 },
        },
        nativeCodex: {
          sessionDirectory: join(directory, "unused-session-directory"),
          version: "0.163.0",
        },
        nativeStatuslines: {
          claude: { version: "2.1.299", subscriptionQuotaConfirmed: true },
        },
      }),
    );
    const run = () =>
      execute(
        process.execPath,
        [
          "--disable-warning=ExperimentalWarning",
          "--import",
          "tsx",
          "collector/src/native-cli.ts",
          configFile,
          "--once",
        ],
        {
          timeout: 15000,
          maxBuffer: 8192,
          env: { ...process.env, PATH: bin + ":" + process.env.PATH },
        },
      );
    expect((await run()).stdout).toContain("ACKNOWLEDGED");
    const callback = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 17 } },
      session_id: "private-fixture-session",
    });
    const wrapper = await import("node:child_process").then(
      ({ spawn }) =>
        new Promise<number | null>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              "--disable-warning=ExperimentalWarning",
              "--import",
              "tsx",
              "collector/src/statusline-cli.ts",
              configFile,
              "claude",
            ],
            { stdio: ["pipe", "ignore", "pipe"] },
          );
          child.once("error", reject);
          child.once("close", resolve);
          child.stdin.end(callback);
        }),
    );
    expect(wrapper).toBe(0);
    expect((await run()).stdout).toContain("ACKNOWLEDGED");
    const csrf = await (await page.request.get("/api/auth/csrf")).json();
    expect(
      (
        await page.request.post("/api/auth/login", {
          headers: { Origin: "http://127.0.0.1:3104" },
          data: {
            password: "local-browser-fixture-password",
            csrfToken: csrf.csrfToken,
          },
        })
      ).status(),
    ).toBe(200);
    const before = (
      await (await page.request.get("/api/dashboard")).json()
    ).data.providers
      .find((p: { providerId: string }) => p.providerId === "claude")
      .windows.find(
        (w: { window: { windowId: string } }) =>
          w.window.windowId === "five_hour",
      ).window;
    await run();
    const after = (
      await (await page.request.get("/api/dashboard")).json()
    ).data.providers
      .find((p: { providerId: string }) => p.providerId === "claude")
      .windows.find(
        (w: { window: { windowId: string } }) =>
          w.window.windowId === "five_hour",
      ).window;
    expect(after.collectedAt).toBe(before.collectedAt);
    expect(after.upstreamObservedAt).toBeNull();
    expect(after.freshnessBasis).toBe("session_snapshot");
    await page.goto("/");
    await expect(
      page
        .getByRole("region", { name: "Hạn mức Claude Code" })
        .getByText("17%", { exact: true }),
    ).toBeVisible();
    await page.goto("/collectors");
    const health = page.getByRole("region", {
      name: "Tình trạng sức khỏe bộ thu thập claude",
    });
    await expect(
      health.getByText("Báo cáo sức khỏe gần đây", { exact: true }),
    ).toBeVisible();
    await expect(
      health.getByText("Hàng đợi tải lên", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Dữ liệu mẫu mô phỏng", { exact: true }),
    ).toBeVisible();
    await expect(
      health.getByText("available · OK", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Tình trạng sức khỏe bộ thu thập codex" })
        .getByText("unsupported · SCHEMA_UNSUPPORTED", { exact: true }),
    ).toBeVisible();
    const old = signedRequest(
      heartbeat({
        providerId: "antigravity",
        sourceType: "antigravity-statusline",
        sequence: 10000,
        collectedAt: new Date(Date.now() - 600000).toISOString(),
        health: fixtureHealth(),
      }),
    );
    expect(
      (
        await page.request.post("/api/internal/usage/ingest", {
          headers: Object.fromEntries(old.headers),
          data: await old.text(),
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(
      page
        .getByRole("region", {
          name: "Tình trạng sức khỏe bộ thu thập antigravity",
        })
        .getByText("Báo cáo sức khỏe đã cũ", { exact: true }),
    ).toBeVisible();
    const future = signedRequest(
      heartbeat({
        providerId: "antigravity",
        sourceType: "antigravity-statusline",
        sequence: 10001,
        collectedAt: new Date(Date.now() + 5000).toISOString(),
        health: fixtureHealth(),
      }),
    );
    expect(
      (
        await page.request.post("/api/internal/usage/ingest", {
          headers: Object.fromEntries(future.headers),
          data: await future.text(),
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(
      page
        .getByRole("region", {
          name: "Tình trạng sức khỏe bộ thu thập antigravity",
        })
        .getByText("Đồng hồ mẫu sức khỏe không chắc chắn", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("collector-health.png"),
      fullPage: true,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
