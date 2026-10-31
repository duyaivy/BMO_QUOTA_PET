import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import type { CollectorConfig } from "./types.js";
const schema = z
  .object({
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
  })
  .strict();
export async function loadConfig(path: string): Promise<CollectorConfig> {
  if ((await stat(path)).size > 16384) throw new Error("CONFIG_TOO_LARGE");
  const value = JSON.parse(await readFile(path, "utf8"));
  return schema.parse(value) as CollectorConfig;
}
