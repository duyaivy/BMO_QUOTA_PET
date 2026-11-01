import { spawn } from "node:child_process";
import { once } from "node:events";
import { parseAntigravity } from "./adapters/antigravity.js";
import type { CollectorConfig } from "./types.js";
import { parseClaude } from "./adapters/claude.js";
import { loadConfig } from "./config.js";
import { StatuslineSpool } from "./statusline-spool.js";

const MAX_CALLBACK_BYTES = 32 * 1024;
const MAX_TOTAL_MS = 1500;

function safeCode(value: unknown) {
  return value instanceof Error && /^[A-Z_]{1,48}$/.test(value.message)
    ? value.message
    : "STATUSLINE_ERROR";
}

async function main() {
  const [configPath, provider, separator, ...command] = process.argv.slice(2);
  if (
    !configPath ||
    (provider !== "claude" && provider !== "antigravity") ||
    (separator !== undefined && separator !== "--") ||
    (separator === "--" && command.length === 0) ||
    command.some((part) => part.length === 0)
  )
    throw new Error("INVALID_ARGUMENTS");

  let spool: StatuslineSpool | null = null;
  let sourceVersion: string | null = null;
  let generation = 0;
  let setupError: string | null = null;
  try {
    const config = (await loadConfig(configPath)) as CollectorConfig;
    const version = config.nativeStatuslines?.[provider]?.version;
    if (
      config.nativeStatuslines?.[provider]?.subscriptionQuotaConfirmed !== true
    )
      throw new Error("POLICY_BLOCKED");
    if (
      config.evidenceMode !== "native" ||
      !config.providers[provider]?.enabled ||
      version !== (provider === "claude" ? "2.1.299" : "1.4.9")
    )
      throw new Error("NATIVE_STATUSLINE_DISABLED");
    sourceVersion = `${provider === "claude" ? "claude-code" : "antigravity"}/${version}`;
    generation = config.providers[provider]!.generation;
    spool = StatuslineSpool.open(config.stateDirectory);
  } catch (error) {
    setupError = safeCode(error);
  }

  let child: ReturnType<typeof spawn> | null = null;
  if (command.length) {
    try {
      child = spawn(command[0]!, command.slice(1), {
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["pipe", "inherit", "inherit"],
      });
      child.stdin?.on("error", () => {});
    } catch {
      throw new Error("STATUSLINE_COMMAND_FAILED");
    }
  }
  const childExit = child ? once(child, "exit").catch(() => [1, null]) : null;
  const deadline = new AbortController();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    deadline.abort();
    process.stdin.destroy();
    child?.stdin?.destroy();
    if (child?.pid && process.platform !== "win32") {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    } else child?.kill("SIGKILL");
  }, MAX_TOTAL_MS);
  const callback: Buffer[] = [];
  let callbackBytes = 0;
  let oversize = false;
  try {
    for await (const item of process.stdin) {
      if (timedOut) break;
      const chunk = Buffer.isBuffer(item) ? item : Buffer.from(item);
      if (!oversize) {
        if (callbackBytes + chunk.length > MAX_CALLBACK_BYTES) {
          oversize = true;
          callback.length = 0;
        } else {
          callback.push(Buffer.from(chunk));
          callbackBytes += chunk.length;
        }
      }
      if (child?.stdin?.writable) {
        try {
          if (!child.stdin.write(chunk))
            await once(child.stdin, "drain", { signal: deadline.signal });
        } catch {
          // The existing command may exit early; BMO still completes capture.
        }
      }
    }
  } catch {
    if (!timedOut) setupError ??= "STATUSLINE_INPUT_FAILED";
  }
  child?.stdin?.end();

  if (!timedOut && !setupError && spool && sourceVersion) {
    const quota = oversize
      ? {
          status: "error" as const,
          errorCode: "MALFORMED_QUOTA",
          windows: [],
          observedAt: null,
        }
      : (provider === "claude" ? parseClaude : parseAntigravity)(
          Buffer.concat(callback, callbackBytes).toString("utf8"),
        );
    const result = spool.enqueue(
      provider,
      sourceVersion,
      quota,
      undefined,
      generation,
    );
    if (!["QUEUED", "DUPLICATE"].includes(result.code))
      setupError = result.code;
  } else if (oversize && !setupError) {
    setupError = "MALFORMED_QUOTA";
  }

  let childStatus = 0;
  if (child) {
    try {
      const [code, signal] = (await childExit!) as [
        number | null,
        NodeJS.Signals | null,
      ];
      childStatus = code ?? (signal ? 1 : 0);
    } catch {
      childStatus = 1;
      setupError ??= "STATUSLINE_COMMAND_FAILED";
    }
  }
  clearTimeout(timer);
  try {
    spool?.close();
  } catch {
    setupError ??= "STATE_UNAVAILABLE";
  }
  if (timedOut) setupError = "STATUSLINE_TIMEOUT";
  if (setupError) process.stderr.write(`${setupError}\n`);
  process.exitCode = childStatus;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${safeCode(error)}\n`);
  process.exitCode = 1;
});
