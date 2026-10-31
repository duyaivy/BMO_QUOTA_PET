import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./index";
import { appSettings } from "./schema";
const changeSchema = z
  .object({
    expectedRevision: z.number().int().positive().safe(),
    freshnessThresholdSeconds: z.number().int().min(60).max(86400),
    historyRetentionDays: z.number().int().min(7).max(365),
  })
  .strict();
export async function readSettings() {
  const [settings] = await (
    await getDb()
  )
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, 1));
  if (!settings) throw new Error("Application settings unavailable");
  return settings;
}
// Internal repository: public callers must authenticate at their request boundary.
export async function updateSettings(change: z.input<typeof changeSchema>) {
  const input = changeSchema.parse(change);
  const [settings] = await (
    await getDb()
  )
    .update(appSettings)
    .set({
      revision: input.expectedRevision + 1,
      freshnessThresholdSeconds: input.freshnessThresholdSeconds,
      historyRetentionDays: input.historyRetentionDays,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(appSettings.id, 1),
        eq(appSettings.revision, input.expectedRevision),
      ),
    )
    .returning();
  if (!settings) throw new Error("Settings revision conflict");
  return settings;
}
