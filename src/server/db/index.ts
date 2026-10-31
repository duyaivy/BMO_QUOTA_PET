import "server-only";
import { createClient, type Client, type Transaction } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { getRuntimeConfig } from "@/server/config";
import * as schema from "./schema";
export type BmoDatabase = LibSQLDatabase<typeof schema> & { $client: Client };
let databasePromise: Promise<BmoDatabase> | undefined;
let activeClient: Client | undefined;
export async function getDb(): Promise<BmoDatabase> {
  databasePromise ??= createDatabase().catch((error: unknown) => {
    activeClient?.close();
    activeClient = undefined;
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}
async function createDatabase(): Promise<BmoDatabase> {
  const config = getRuntimeConfig();
  if (config.TURSO_DATABASE_URL.startsWith("file:"))
    await mkdir(dirname(resolve(config.TURSO_DATABASE_URL.slice(5))), {
      recursive: true,
    });
  const client = createClient({
    url: config.TURSO_DATABASE_URL,
    authToken: config.TURSO_AUTH_TOKEN || undefined,
  });
  activeClient = client;
  await applyMigrations(client);
  return drizzle(client, { schema });
}
export async function applyMigrations(client: Client) {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(
    "CREATE TABLE IF NOT EXISTS bmo_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)",
  );
  const folder = resolve(process.cwd(), "drizzle");
  const names = (await readdir(folder))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (!names.length) throw new Error("Database migrations are missing");
  for (const name of names) {
    const source = await readFile(resolve(folder, name), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const known = await client.execute({
      sql: "SELECT checksum FROM bmo_migrations WHERE name = ?",
      args: [name],
    });
    if (known.rows.length) {
      if (known.rows[0]?.checksum !== checksum)
        throw new Error("Database migration checksum mismatch");
      continue;
    }
    const tx = await client.transaction("write");
    try {
      const previous = await tx.execute({
        sql: "SELECT checksum FROM bmo_migrations WHERE name = ?",
        args: [name],
      });
      if (previous.rows.length) {
        if (previous.rows[0]?.checksum !== checksum)
          throw new Error("Database migration checksum mismatch");
      } else {
        // Migrations use Drizzle statement breakpoints; never split SQL string literals.
        for (const statement of source
          .split("--> statement-breakpoint")
          .map((part) => part.trim())
          .filter(Boolean))
          await tx.executeMultiple(statement);
        await tx.execute({
          sql: "INSERT INTO bmo_migrations(name,checksum,applied_at) VALUES(?,?,?)",
          args: [name, checksum, Date.now()],
        });
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }
}
export async function closeDbForTests() {
  activeClient?.close();
  activeClient = undefined;
  databasePromise = undefined;
}

// libSQL's local driver admits one writer. Bound/serialize same-process transactions.
let writeTail = Promise.resolve();
let pendingWrites = 0;
export async function writeTransaction<T>(
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (pendingWrites >= 64) throw new Error("Database write capacity exceeded");
  pendingWrites++;
  const previous = writeTail;
  let release!: () => void;
  writeTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  let tx: Transaction | undefined;
  try {
    tx = await (await getDb()).$client.transaction("write");
    const result = await operation(tx);
    await tx.commit();
    return result;
  } catch (error) {
    if (tx) await tx.rollback();
    throw error;
  } finally {
    tx?.close();
    pendingWrites--;
    release();
  }
}
