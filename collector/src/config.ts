import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import type { CollectorConfig } from "./types.js";
const schema = z
  .object({
    evidenceMode: z.enum(["fixture", "native"]).default("fixture"),
    collectorId: z.string().min(1).max(128),
    keyId: z.string().min(1).max(128),
    secretFile: z.string().min(1),
    url: z.string().url(),
    stateDirectory: z.string().min(1),
    allowLocalHttp: z.boolean().optional(),
    providers: z
      .object({
        codex: z
          .object({
            enabled: z.boolean().default(false),
            generation: z.number().int().positive(),
          })
          .optional(),
        claude: z
          .object({
            enabled: z.boolean().default(false),
            generation: z.number().int().positive(),
          })
          .optional(),
        antigravity: z
          .object({
            enabled: z.boolean().default(false),
            generation: z.number().int().positive(),
          })
          .optional(),
      })
      .default({}),
    maxQueueBytes: z.number().int().positive().max(1048576).optional(),
    maxAgeMs: z.number().int().positive().max(86400000).optional(),
    timeoutMs: z.number().int().positive().max(60000).optional(),
    nativeStatuslines: z
      .object({
        claude: z
          .object({
            version: z.literal("2.1.299"),
            subscriptionQuotaConfirmed: z.boolean().default(false),
          })
          .strict()
          .optional(),
        antigravity: z
          .object({
            version: z.enum(["1.4.9", "1.5.1"]),
            subscriptionQuotaConfirmed: z.boolean().default(false),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    nativeCodex: z
      .object({
        sessionDirectory: z.string().min(1),
        version: z.literal("0.163.0"),
      })
      .strict()
      .optional(),
  })
  .strict();
export async function loadConfig(path: string): Promise<CollectorConfig> {
  if ((await stat(path)).size > 16384) throw new Error("CONFIG_TOO_LARGE");
  const value = JSON.parse(await readFile(path, "utf8"));
  return schema.parse(value) as CollectorConfig;
}
