import "server-only";
import { z } from "zod";
import { safeId, sources, providerIds } from "@/contracts/usage";
import { writeTransaction } from "@/server/db";
const enrollment = z
  .object({
    collectorId: safeId,
    name: z.string().min(1).max(80),
    keyId: safeId,
    providerId: z.enum(providerIds),
    completeSetVerified: z.boolean().default(false),
  })
  .strict();
// Local development operation only. No native provider configuration is touched.
export async function enrollFixture(input: z.input<typeof enrollment>) {
  if (
    process.env.BMO_ALLOW_FIXTURE_SETUP !== "true" ||
    !process.env.TURSO_DATABASE_URL?.startsWith("file:")
  )
    throw new Error(
      "Fixture enrollment requires explicit local development setup",
    );
  const value = enrollment.parse(input);
  return writeTransaction(async (tx) => {
    const now = Date.now();
    await tx.execute({
      sql: "INSERT INTO collectors(collector_id,name,fixture_mode,created_at) VALUES(?,?,1,?) ON CONFLICT(collector_id) DO UPDATE SET name=excluded.name",
      args: [value.collectorId, value.name, now],
    });
    const existing = await tx.execute({
      sql: "SELECT collector_id FROM collector_keys WHERE key_id=?",
      args: [value.keyId],
    });
    if (
      existing.rows.length &&
      existing.rows[0].collector_id !== value.collectorId
    )
      throw new Error("Key association conflict");
    await tx.execute({
      sql: "INSERT OR IGNORE INTO collector_keys(key_id,collector_id,active_from) VALUES(?,?,?)",
      args: [value.keyId, value.collectorId, now],
    });
    await tx.execute({
      sql: "UPDATE provider_config SET enabled=1, authoritative_collector_id=?, source_type=?, ownership_generation=ownership_generation+1, complete_set_verified=?, latest_sequence=0, last_collected_at=NULL, data_status='unavailable',error_code=NULL,updated_at=? WHERE provider_id=?",
      args: [
        value.collectorId,
        sources[value.providerId],
        Number(value.completeSetVerified),
        now,
        value.providerId,
      ],
    });
    await tx.execute({
      sql: "DELETE FROM current_windows WHERE provider_id=?",
      args: [value.providerId],
    });
    await tx.execute({
      sql: "UPDATE app_settings SET revision=revision+1,updated_at=? WHERE id=1",
      args: [now],
    });
    const result = await tx.execute({
      sql: "SELECT ownership_generation FROM provider_config WHERE provider_id=?",
      args: [value.providerId],
    });
    return Number(result.rows[0].ownership_generation);
  });
}
