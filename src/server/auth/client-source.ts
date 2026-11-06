import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { AuthError } from "./index";
// Trust platform metadata only on Vercel; elsewhere require the Node entrypoint's seal.
export function requestClientSource(request: Request) {
  if (process.env.VERCEL === "1") {
    // Vercel supplies this independently of client-supplied forwarding headers.
    // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
    const address = request.headers.get("x-vercel-forwarded-for") ?? "";
    if (!isIP(address)) throw new AuthError("CLIENT_SOURCE_INVALID", 403);
    return address;
  }
  const secret = process.env.BMO_CLIENT_SOURCE_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) {
    if (process.env.NODE_ENV !== "production") return "127.0.0.1";
    throw new AuthError("UNAVAILABLE", 503);
  }
  const value = request.headers.get("X-BMO-Trusted-Client") ?? "";
  if (value.length > 160) throw new AuthError("CLIENT_SOURCE_INVALID", 403);
  const [address, timestamp, signature, extra] = value.split(";");
  if (
    extra !== undefined ||
    !isIP(address ?? "") ||
    !/^\d{10}$/.test(timestamp ?? "") ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 ||
    !/^[a-f0-9]{64}$/.test(signature ?? "")
  )
    throw new AuthError("CLIENT_SOURCE_INVALID", 403);
  const expected = createHmac("sha256", secret)
    .update(`BMO-CLIENT-V1\n${address}\n${timestamp}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new AuthError("CLIENT_SOURCE_INVALID", 403);
  return address;
}
