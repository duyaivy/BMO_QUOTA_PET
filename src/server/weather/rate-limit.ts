import "server-only";
import { AuthError } from "@/server/auth";
import { writeTransaction } from "@/server/db";
export async function admitWeatherLookup(
  sessionHash: string,
  nowMs = Date.now(),
): Promise<void> {
  const start = Math.floor(nowMs / 60000) * 60000;
  const count = await writeTransaction(async (tx) => {
    const result = await tx.execute({
      sql: "INSERT INTO rate_limits(scope,subject_hash,window_start,attempts,expires_at) VALUES('weather-location',?,?,1,?) ON CONFLICT(scope,subject_hash,window_start) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
      args: [sessionHash, start, start + 120000],
    });
    return Number(result.rows[0].attempts);
  });
  if (count > 30) throw new AuthError("RATE_LIMITED", 429);
}
