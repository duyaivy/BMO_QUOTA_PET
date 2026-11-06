import "server-only";
import argon2 from "argon2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { getRuntimeConfig } from "@/server/config";
import { getDb, writeTransaction } from "@/server/db";
import { adminSessions } from "@/server/db/schema";
const SESSION_SECONDS = 8 * 60 * 60;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const subject = createHash("sha256").update("global-owner-login").digest("hex");
type CookieSession = { handle?: string; csrf?: string; csrfExpiresAt?: number };
function options(): SessionOptions {
  const config = getRuntimeConfig();
  return {
    cookieName: "bmo_owner",
    password: config.SESSION_SECRET,
    ttl: SESSION_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: config.BMO_APP_ORIGIN.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    },
  };
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const cookie = async () =>
  getIronSession<CookieSession>(await cookies(), options());
export class AuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
export async function issueCsrfToken() {
  const session = await cookie();
  session.csrf = randomBytes(32).toString("hex");
  session.csrfExpiresAt = Date.now() + 10 * 60 * 1000;
  await session.save();
  return session.csrf;
}
export async function getCsrfFromCookie() {
  const session = await cookie();
  return session.csrf && (session.csrfExpiresAt ?? 0) > Date.now()
    ? session.csrf
    : undefined;
}
export async function requireCsrf(token: unknown) {
  const session = await cookie();
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token) ||
    !session.csrf ||
    (session.csrfExpiresAt ?? 0) <= Date.now() ||
    session.csrf.length !== token.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrf))
  )
    throw new AuthError("CSRF_INVALID", 403);
}
export async function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = getRuntimeConfig().BMO_APP_ORIGIN;
  if (!origin) throw new AuthError("ORIGIN_INVALID", 403);
  if (origin === configured) return;
  try {
    const oUrl = new URL(origin);
    const cUrl = new URL(configured);
    if (
      oUrl.port === cUrl.port &&
      oUrl.protocol === cUrl.protocol &&
      ["localhost", "127.0.0.1", "[::1]"].includes(oUrl.hostname) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(cUrl.hostname)
    ) {
      return;
    }
  } catch {}
  throw new AuthError("ORIGIN_INVALID", 403);
}
export async function admitLoginAttempt(source: string) {
  const now = Date.now();
  const start = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const admitted = await writeTransaction(async (tx) => {
    for (const [scope, key, limit] of [
      ["login-source", hash(source), 5],
      ["login", subject, 20],
    ] as const) {
      const result = await tx.execute({
        sql: "INSERT INTO rate_limits(scope,subject_hash,window_start,attempts,expires_at) VALUES(?,?,?,1,?) ON CONFLICT(scope,subject_hash,window_start) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
        args: [scope, key, start, start + RATE_WINDOW_MS * 2],
      });
      if (Number(result.rows[0]?.attempts) > limit) return false;
    }
    await tx.execute({
      sql: "DELETE FROM rate_limits WHERE expires_at < ?",
      args: [now],
    });
    return true;
  });
  if (!admitted) throw new AuthError("LOGIN_FAILED", 429);
}

let activeVerifications = 0;
export async function login(password: string, source: string) {
  if (!password || Buffer.byteLength(password, "utf8") > 1024)
    throw new AuthError("LOGIN_FAILED", 401);
  if (activeVerifications >= 2) throw new AuthError("LOGIN_FAILED", 429);
  activeVerifications++;
  try {
    let valid = false;
    const stored = getRuntimeConfig().ADMIN_PASSWORD_HASH;
    try {
      if (stored.startsWith("$argon2id$")) {
        valid = await argon2.verify(stored, password);
      }
    } catch {
      valid = false;
    }
    if (!valid) {
      await admitLoginAttempt(source);
      throw new AuthError("LOGIN_FAILED", 401);
    }
    const now = Date.now();
    const expiresAt = now + SESSION_SECONDS * 1000;
    const handle = randomBytes(32).toString("hex");
    await writeTransaction(async (tx) => {
      await tx.execute({
        sql: "DELETE FROM admin_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL",
        args: [now],
      });
      await tx.execute({
        sql: "INSERT INTO admin_sessions(handle_hash,expires_at,created_at) VALUES(?,?,?)",
        args: [hash(handle), expiresAt, now],
      });
      await tx.execute({
        sql: "DELETE FROM rate_limits WHERE (scope='login' AND subject_hash=?) OR (scope='login-source' AND subject_hash=?)",
        args: [subject, hash(source)],
      });
    });
    const session = await cookie();
    session.handle = handle;
    session.csrf = randomBytes(32).toString("hex");
    session.csrfExpiresAt = expiresAt;
    await session.save();
  } finally {
    activeVerifications--;
  }
}
export async function getAdminSession() {
  const session = await cookie();
  if (!session.handle || !/^[a-f0-9]{64}$/.test(session.handle)) return null;
  const db = await getDb();
  const [record] = await db
    .select({
      expiresAt: adminSessions.expiresAt,
      revokedAt: adminSessions.revokedAt,
    })
    .from(adminSessions)
    .where(eq(adminSessions.handleHash, hash(session.handle)))
    .limit(1);
  return !record || record.revokedAt !== null || record.expiresAt <= Date.now()
    ? null
    : { expiresAt: record.expiresAt };
}
export async function requireAdmin() {
  const record = await getAdminSession();
  if (!record) throw new AuthError("UNAUTHORIZED", 401);
  return record;
}
export async function logout() {
  await requireAdmin();
  const session = await cookie();
  const db = await getDb();
  await db
    .update(adminSessions)
    .set({ revokedAt: Date.now() })
    .where(eq(adminSessions.handleHash, hash(session.handle!)));
  session.destroy();
}
