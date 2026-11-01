import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseClaude } from "../src/adapters/claude.js";
import { StatuslineSpool } from "../src/statusline-spool.js";

const directories: string[] = [];
async function temp() {
  const path = await mkdtemp(join(tmpdir(), "bmo-statusline-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function callback(used = 27, reset = 1793443200) {
  return JSON.stringify({
    rate_limits: {
      five_hour: { used_percentage: used, resets_at: reset },
      seven_day: { used_percentage: 64, resets_at: reset + 1000 },
    },
    session_id: "sensitive-session",
    transcript_path: "/private/conversation.jsonl",
    email: "owner@example.invalid",
    model: { id: "sensitive-model" },
    cost: 123,
  });
}

const version = "claude-code/2.1.299";

function runCli(
  configPath: string,
  input: string,
  command?: string[],
  provider: "claude" | "antigravity" = "claude",
) {
  const startedAt = Date.now();
  return new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    elapsedMs: number;
  }>((resolve, reject) => {
    const args = [
      "--disable-warning=ExperimentalWarning",
      "--import",
      "tsx",
      "collector/src/statusline-cli.ts",
      configPath,
      provider,
      ...(command ? ["--", process.execPath, "-e", command[0]!] : []),
    ];
    const child = spawn(process.execPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      resolve({ code, stdout, stderr, elapsedMs: Date.now() - startedAt }),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function config(
  directory: string,
  subscriptionQuotaConfirmed = true,
  provider: "claude" | "antigravity" = "claude",
) {
  const path = join(directory, "collector.json");
  await writeFile(
    path,
    JSON.stringify({
      evidenceMode: "native",
      collectorId: "native-collector",
      keyId: "native-key",
      secretFile: "/unused/by/statusline",
      url: "https://example.invalid/api/internal/usage/ingest",
      stateDirectory: join(directory, "state"),
      providers: { [provider]: { enabled: true, generation: 1 } },
      nativeStatuslines: {
        [provider]: {
          version: provider === "claude" ? "2.1.299" : "1.4.9",
          subscriptionQuotaConfirmed,
        },
      },
    }),
  );
  return path;
}

describe("Claude statusline parser", () => {
  it("allowlists documented quota fields and leaves upstream time unknown", () => {
    const parsed = parseClaude(callback());
    expect(parsed).toEqual({
      status: "ok",
      errorCode: null,
      observedAt: null,
      windows: [
        {
          windowId: "five_hour",
          label: "Five hour",
          duration: 18000,
          used: 27,
          reset: "2026-10-31T10:40:00.000Z",
        },
        {
          windowId: "seven_day",
          label: "Seven day",
          duration: 604800,
          used: 64,
          reset: "2026-10-31T10:56:40.000Z",
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toContain("sensitive");
  });

  it("does not substitute Claude context occupancy or API cost for subscription quota", () => {
    const parsed = parseClaude(
      JSON.stringify({
        context_window: { used_percentage: 88, total_input_tokens: 100000 },
        cost: { total_cost_usd: 12 },
      }),
    );
    expect(parsed).toEqual({
      status: "unavailable",
      errorCode: "SOURCE_UNAVAILABLE",
      windows: [],
      observedAt: null,
    });
  });

  it("distinguishes absent quota from malformed callback data", () => {
    expect(parseClaude("{}")).toMatchObject({
      status: "unavailable",
      errorCode: "SOURCE_UNAVAILABLE",
    });
    expect(parseClaude("{")).toMatchObject({
      status: "error",
      errorCode: "MALFORMED_QUOTA",
    });
    expect(
      parseClaude(
        JSON.stringify({
          rate_limits: { five_hour: { used_percentage: "27" } },
        }),
      ),
    ).toMatchObject({ status: "error", errorCode: "MALFORMED_QUOTA" });
    expect(parseClaude("x".repeat(32 * 1024 + 1))).toMatchObject({
      errorCode: "MALFORMED_QUOTA",
    });
  });
});

describe("private statusline spool", () => {
  it("persists a sanitized callback, deduplicates rerenders, and keeps dedup after acknowledgement/reopen", async () => {
    const directory = await temp();
    let spool = StatuslineSpool.open(join(directory, "state"));
    expect(spool.enqueue("claude", version, parseClaude(callback()))).toEqual({
      code: "QUEUED",
    });
    expect(spool.enqueue("claude", version, parseClaude(callback()))).toEqual({
      code: "DUPLICATE",
    });
    const pending = spool.pending();
    expect(pending).toHaveLength(1);
    expect(JSON.stringify(pending)).not.toContain("sensitive");
    expect(JSON.stringify(pending)).not.toContain("owner@example");
    expect(JSON.stringify(pending)).not.toContain("conversation.jsonl");
    const database = await readFile(join(directory, "state", "statusline.db"));
    expect((await lstat(join(directory, "state"))).mode & 0o077).toBe(0);
    expect(
      (await lstat(join(directory, "state", "statusline.db"))).mode & 0o077,
    ).toBe(0);
    expect(database.includes(Buffer.from("sensitive-session"))).toBe(false);
    spool.acknowledge(pending[0]!.id);
    spool.close();
    spool = StatuslineSpool.open(join(directory, "state"));
    expect(spool.enqueue("claude", version, parseClaude(callback()))).toEqual({
      code: "DUPLICATE",
    });
    expect(spool.pending()).toHaveLength(0);
    expect(spool.enqueue("claude", version, parseClaude(callback(28)))).toEqual(
      { code: "QUEUED" },
    );
    spool.close();
  });

  it("bounds queued record count and counts capacity drops", async () => {
    const directory = await temp();
    const spool = StatuslineSpool.open(join(directory, "state"));
    for (let i = 0; i < 128; i++) {
      const quota = parseClaude(callback(i % 101, 1793443200 + i));
      expect(spool.enqueue("claude", version, quota)).toEqual({
        code: "QUEUED",
      });
    }
    expect(
      spool.enqueue("claude", version, parseClaude(callback(50, 1793449999))),
    ).toEqual({ code: "QUEUE_FULL" });
    expect(spool.inspect()).toMatchObject({ pending: 128, dropped: 1 });
    spool.close();
  });

  it("executes the existing command with the same stdin even when callback parsing fails", async () => {
    const directory = await temp();
    const path = await config(directory);
    const echoed = await runCli(path, "{malformed native input", [
      'let value="";process.stdin.on("data",x=>value+=x);process.stdin.on("end",()=>process.stdout.write("legacy:"+value))',
    ]);
    expect(echoed.code).toBe(0);
    expect(echoed.stdout).toBe("legacy:{malformed native input");
    expect(echoed.stderr).toBe("");
    const spool = StatuslineSpool.open(join(directory, "state"));
    expect(spool.pending()).toHaveLength(1);
    expect(spool.pending()[0]?.quota.errorCode).toBe("MALFORMED_QUOTA");
    spool.close();
  });

  it("spools without any network access when the uploader is offline", async () => {
    const directory = await temp();
    const path = await config(directory);
    const result = await runCli(path, callback());
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.elapsedMs).toBeLessThan(1500);
    const spool = StatuslineSpool.open(join(directory, "state"));
    expect(spool.pending()).toHaveLength(1);
    expect(spool.inspect().pending).toBe(1);
    spool.close();
  });

  it("requires owner confirmation of subscription quota and still forwards the existing command", async () => {
    const directory = await temp();
    const path = await config(directory, false);
    const result = await runCli(path, callback(), [
      'let value="";process.stdin.on("data",x=>value+=x);process.stdin.on("end",()=>process.stdout.write("legacy:"+value))',
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`legacy:${callback()}`);
    expect(result.stderr).toBe("POLICY_BLOCKED\n");
    expect(await lstat(join(directory, "state")).catch(() => null)).toBeNull();
  });

  it("keeps disabled Claude inert while preserving the existing statusline command", async () => {
    const directory = await temp();
    const path = await config(directory);
    const value = JSON.parse(await readFile(path, "utf8"));
    value.providers.claude.enabled = false;
    await writeFile(path, JSON.stringify(value));
    const result = await runCli(path, callback(), [
      'process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("existing-status"))',
    ]);
    expect(result).toMatchObject({
      code: 0,
      stdout: "existing-status",
      stderr: "NATIVE_STATUSLINE_DISABLED\n",
    });
    expect(await lstat(join(directory, "state")).catch(() => null)).toBeNull();
  });

  it("bounds a hung previous statusline command", async () => {
    const directory = await temp();
    const path = await config(directory);
    const result = await runCli(path, callback(), [
      "setTimeout(() => {}, 5000)",
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("STATUSLINE_TIMEOUT");
    expect(result.elapsedMs).toBeLessThan(1800);
  });

  it("aborts a backpressured legacy stdin wait at the callback deadline", async () => {
    const directory = await temp();
    const result = await runCli(
      await config(directory),
      "x".repeat(1024 * 1024),
      ["setTimeout(()=>{},10000)"],
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("STATUSLINE_TIMEOUT");
    expect(result.elapsedMs).toBeLessThan(2200);
  });

  it("supports a labeled synthetic AGY callback while preserving legacy output", async () => {
    const directory = await temp();
    const input = JSON.stringify({
      quota: { model: { remaining_fraction: 0.5 } },
      session_id: "private",
    });
    const result = await runCli(
      await config(directory, true, "antigravity"),
      input,
      [
        'process.stdin.resume();process.stdin.on("end",()=>{process.stdout.write("legacy-agy");process.exitCode=7})',
      ],
      "antigravity",
    );
    expect(result).toMatchObject({ code: 7, stdout: "legacy-agy", stderr: "" });
    const spool = StatuslineSpool.open(join(directory, "state"));
    expect(spool.pending()[0]).toMatchObject({
      providerId: "antigravity",
      sourceVersion: "antigravity/1.4.9",
      ownershipGeneration: 1,
    });
    expect(JSON.stringify(spool.pending())).not.toContain("private");
    spool.close();
  });

  it("rejects a statusline directory with broad permissions", async () => {
    const directory = await temp();
    const state = join(directory, "state");
    const spool = StatuslineSpool.open(state);
    spool.close();
    await chmod(state, 0o755);
    expect(() => StatuslineSpool.open(state)).toThrow("STATE_PERMISSIONS");
  });
});
