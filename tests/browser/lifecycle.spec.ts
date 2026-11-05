import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startFixtureApp } from "../fixtures/browser-app.js";

const APP = "http://127.0.0.1:3104";
const COLLECTOR = "fixture-collector";
const KEY_ID = "fixture-key";
const SECRET = "b".repeat(64);
let stopFixtureApp: (() => Promise<void>) | undefined;

test.use({ baseURL: APP });
test.beforeAll(async () => {
  stopFixtureApp = await startFixtureApp(3104);
});
test.afterAll(async () => {
  await stopFixtureApp?.();
});

async function login(page: Page) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: APP },
    data: { password: "local-browser-fixture-password", csrfToken },
  });
  expect(response.status()).toBe(200);
}

function outputReader(child: ChildProcess) {
  let output = "";
  const changed: Array<() => void> = [];
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
    output = (output + chunk).slice(-16384);
    for (const notify of changed.splice(0)) notify();
  });
  return {
    async waitForCount(value: string, count: number, timeoutMs: number) {
      const occurrences = () => output.split(value).length - 1;
      const deadline = Date.now() + timeoutMs;
      while (occurrences() < count) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("COLLECTOR_OUTPUT_TIMEOUT");
        await new Promise<void>((resolve, reject) => {
          const notify = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(() => {
            const index = changed.indexOf(notify);
            if (index >= 0) changed.splice(index, 1);
            reject(new Error("COLLECTOR_OUTPUT_TIMEOUT"));
          }, remaining);
          changed.push(notify);
        });
      }
    },
  };
}

function requestHeaders(request: IncomingMessage) {
  const names = [
    "content-type",
    "x-bmo-key-id",
    "x-bmo-timestamp",
    "x-bmo-nonce",
    "x-bmo-signature",
    "idempotency-key",
  ];
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = request.headers[name];
      return typeof value === "string" ? [[name, value]] : [];
    }),
  );
}

async function readRequest(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.length;
    if (bytes > 32768) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes);
}

function proxyResponse(
  response: ServerResponse,
  status: number,
  body: Uint8Array,
) {
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": body.byteLength,
    connection: "close",
  });
  response.end(body);
}

async function stopChild(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGCONT");
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
}

async function waitForExit(child: ChildProcess, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      once(child, "exit") as Promise<[number | null, NodeJS.Signals | null]>,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("COLLECTOR_EXIT_TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("native Codex collector recovers quota across offline retry, suspend, resume and restart", async ({
  page,
}) => {
  test.setTimeout(45000);
  await login(page);

  const directory = await mkdtemp(join(tmpdir(), "bmo-native-lifecycle-"));
  const sessionDirectory = join(directory, "sessions");
  const fakeBin = join(directory, "bin");
  const secretFile = join(directory, "bmo.key");
  const configFile = join(directory, "native.json");
  const rollout = join(sessionDirectory, "rollout.jsonl");
  await mkdir(sessionDirectory);
  await mkdir(fakeBin);
  await writeFile(rollout, "");
  await writeFile(secretFile, SECRET, { mode: 0o600 });
  const codexExecutable = join(fakeBin, "codex");
  await writeFile(
    codexExecutable,
    "#!/bin/sh\nprintf 'codex-cli 0.163.0\\n'\n",
    {
      mode: 0o700,
    },
  );
  await chmod(codexExecutable, 0o700);

  let online = false;
  const proxy = createServer(async (request, response) => {
    try {
      if (
        request.method !== "POST" ||
        request.url !== "/api/internal/usage/ingest"
      ) {
        proxyResponse(
          response,
          404,
          Buffer.from('{"error":{"code":"NOT_FOUND"}}'),
        );
        return;
      }
      const body = await readRequest(request);
      if (!online) {
        proxyResponse(
          response,
          503,
          Buffer.from('{"error":{"code":"TEMPORARY_FAILURE"}}'),
        );
        return;
      }
      const upstream = await fetch(`${APP}${request.url}`, {
        method: "POST",
        headers: requestHeaders(request),
        body,
      });
      const result = new Uint8Array(await upstream.arrayBuffer());
      proxyResponse(response, upstream.status, result);
    } catch {
      if (!response.headersSent)
        proxyResponse(
          response,
          502,
          Buffer.from('{"error":{"code":"PROXY_FAILURE"}}'),
        );
      else response.destroy();
    }
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  if (!address || typeof address === "string")
    throw new Error("PROXY_START_FAILED");
  const ingestionUrl = `http://127.0.0.1:${address.port}/api/internal/usage/ingest`;
  await writeFile(
    configFile,
    JSON.stringify({
      evidenceMode: "native",
      collectorId: COLLECTOR,
      keyId: KEY_ID,
      secretFile,
      url: ingestionUrl,
      stateDirectory: join(directory, "state"),
      allowLocalHttp: true,
      providers: { codex: { enabled: true, generation: 2 } },
      nativeCodex: { sessionDirectory, version: "0.163.0" },
    }),
  );

  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    FORCE_COLOR: undefined,
  };
  const args = [
    "--disable-warning=ExperimentalWarning",
    "--import",
    "tsx",
    "collector/src/native-cli.ts",
    configFile,
  ];
  let daemon: ChildProcess | undefined;
  let restarted: ChildProcess | undefined;
  try {
    daemon = spawn(process.execPath, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const reader = outputReader(daemon);
    let daemonError = "";
    daemon.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      daemonError = (daemonError + chunk).slice(-2048);
    });
    await reader.waitForCount("TEMPORARY_FAILURE", 1, 10000);
    daemon.kill("SIGSTOP");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const capturedAt = new Date().toISOString();
    const resetsAt = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
    await writeFile(
      rollout,
      JSON.stringify({
        type: "event_msg",
        timestamp: capturedAt,
        payload: {
          type: "token_count",
          rate_limits: {
            limit_id: "lifecycle-test",
            limit_name: "Synthetic lifecycle quota",
            primary: {
              used_percent: 33,
              window_minutes: 300,
              resets_at: resetsAt,
            },
          },
          private_marker: "lifecycle-private-sentinel",
        },
      }) + "\n",
    );
    online = true;
    daemon.kill("SIGCONT");
    await reader.waitForCount("ACKNOWLEDGED", 2, 15000);
    expect(daemonError).toBe("");

    await page.goto("/");
    const card = page.getByRole("region", { name: "Hạn mức Codex" });
    const window = page.getByRole("group", { name: "Khung hạn mức Primary" });
    await expect(window.getByText("33%", { exact: true })).toBeVisible();
    await expect(
      window.getByText("Chưa xác minh độ mới", { exact: true }),
    ).toBeVisible();
    await window.getByText("Chi tiết dữ liệu", { exact: true }).click();
    await expect(
      window.getByText("Thời điểm nguồn quan sát (UTC)", { exact: true }),
    ).toBeVisible();
    await expect(
      window.locator("dl").getByText("Chưa xác định", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByText("Dữ liệu mẫu mô phỏng", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("lifecycle-private-sentinel", { exact: true }),
    ).toHaveCount(0);

    const dashboard = async () => {
      const response = await page.request.get("/api/dashboard");
      expect(response.status()).toBe(200);
      const body = await response.json();
      const provider = body.data.providers.find(
        (item: { providerId: string }) => item.providerId === "codex",
      );
      return provider.windows.find(
        (item: { window: { windowId: string } }) =>
          item.window.windowId === "lifecycle-test.primary",
      ).window as {
        collectedAt: string;
        upstreamObservedAt: string | null;
        sourceFreshness: string;
        usedPercent: number;
      };
    };
    const first = await dashboard();
    expect(first).toMatchObject({
      upstreamObservedAt: null,
      sourceFreshness: "unknown",
      usedPercent: 33,
    });

    await stopChild(daemon);
    daemon = undefined;
    restarted = spawn(process.execPath, [...args, "--once"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let restartOutput = "";
    let restartError = "";
    restarted.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      restartOutput = (restartOutput + chunk).slice(-8192);
    });
    restarted.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      restartError = (restartError + chunk).slice(-2048);
    });
    const restartExit = await waitForExit(restarted, 15000);
    expect(restartExit[0]).toBe(0);
    expect(restartError).toBe("");
    expect(restartOutput).not.toContain("SOURCE_UNAVAILABLE");
    expect(restartOutput).not.toContain('"records":1');
    await page.goto("/");
    const afterRestart = await dashboard();
    expect(afterRestart).toEqual(first);
  } finally {
    await stopChild(daemon);
    await stopChild(restarted);
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
