import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "./config.js";
import { FixtureCollector } from "./index.js";
import { LineFramer } from "./framer.js";
import type { ProviderId } from "./types.js";

async function main() {
  const [configPath, provider, fixturePath, mode] = process.argv.slice(2);
  if (
    !configPath ||
    !["codex", "claude", "antigravity"].includes(provider) ||
    !fixturePath ||
    (mode && mode !== "--upload")
  )
    throw new Error("INVALID_ARGUMENTS");
  const config = await loadConfig(configPath);
  const p = provider as ProviderId;
  if (!config.providers[p]?.enabled) throw new Error("SOURCE_DISABLED");
  const collector = await FixtureCollector.open(config);
  let shutting = false;
  const input =
    fixturePath === "-" ? process.stdin : createReadStream(fixturePath);
  const stop = () => {
    shutting = true;
    input.destroy();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    let streamId: string | null = null,
      skip = 0,
      ordinal = 0,
      blocked = false;
    if (fixturePath !== "-") {
      const meta = await stat(fixturePath);
      if (!meta.isFile()) throw new Error("INVALID_FIXTURE_FILE");
      streamId = createHash("sha256")
        .update(
          [resolve(fixturePath), meta.dev, meta.ino, meta.birthtimeMs].join(
            ":",
          ),
        )
        .digest("hex");
      const saved = await collector.checkpoint(p);
      if (saved?.streamId === streamId) skip = saved.offset;
    }
    const framer = new LineFramer(),
      decoder = new StringDecoder("utf8");
    const capture = async (record: string) => {
      ordinal++;
      if (ordinal <= skip) return;
      const result = await collector.capture(
        p,
        record,
        undefined,
        streamId ? { streamId, offset: ordinal } : undefined,
      );
      process.stdout.write(result.code + "\n");
      if (!result.queued && result.code !== "DUPLICATE") blocked = true;
    };
    const consume = async (text: string) => {
      const result = framer.push(text);
      if (result.rejected) {
        process.stdout.write("OVERSIZED_RECORD\n");
        blocked = true;
        return;
      }
      for (const record of result.records) {
        if (blocked || shutting) break;
        await capture(record);
      }
    };
    try {
      for await (const chunk of input) {
        if (shutting || blocked) break;
        await consume(
          decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
      }
    } catch (error) {
      if (!shutting) throw error;
    }
    if (!shutting && !blocked) {
      await consume(decoder.end());
      const tail = framer.finish();
      if (tail.record) await capture(tail.record);
      if (tail.rejected) process.stdout.write("OVERSIZED_RECORD\n");
      if (ordinal < skip) throw new Error("FIXTURE_TRUNCATED");
    }
    if (mode === "--upload") {
      while (!shutting) {
        const diagnostics = await collector.inspect();
        if (!diagnostics.pending) break;
        const result = await collector.uploadOnce();
        if (result.code !== "EMPTY") process.stdout.write(result.code + "\n");
        if (result.code === "EMPTY") {
          const events = await collector.pendingEvents();
          if (
            !events.some(
              (event) =>
                config.providers[event.providerId]?.enabled &&
                !diagnostics.pausedSources.includes(event.providerId),
            )
          )
            break;
          await sleep(250);
        }
      }
    }
  } finally {
    input.destroy();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await collector.close();
  }
}
try {
  await main();
} catch (error) {
  process.stderr.write(
    (error instanceof Error && /^[A-Z_]{1,48}$/.test(error.message)
      ? error.message
      : "COLLECTOR_ERROR") + "\n",
  );
  process.exitCode = 1;
}
