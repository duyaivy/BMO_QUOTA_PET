import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { AuthError } from "./index";
// Only the local Node entrypoint can attest a socket address. Never trust X-Forwarded-For.
export function requestClientSource(request: Request) {
  const secret = process.env.BMO_CLIENT_SOURCE_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret))
    throw new AuthError("UNAVAILABLE", 503);
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
