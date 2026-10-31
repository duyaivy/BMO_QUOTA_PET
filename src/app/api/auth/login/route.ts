import { checkOrigin, login, requireCsrf, AuthError } from "@/server/auth";
import { z } from "zod";
import { requestClientSource } from "@/server/auth/client-source";

export const runtime = "nodejs";
const loginInput = z
  .object({ password: z.string().max(1024), csrfToken: z.string().max(128) })
  .strict();

async function readBoundedBody(request: Request, limit: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError("body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
}

export async function POST(request: Request) {
  try {
    await checkOrigin(request);
    const source = requestClientSource(request);
    const raw = await readBoundedBody(request, 2048);
    const input = loginInput.parse(JSON.parse(raw));
    await requireCsrf(input.csrfToken);
    await login(input.password, source);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json(
        { error: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      error instanceof RangeError ||
      error instanceof SyntaxError ||
      error instanceof TypeError ||
      error instanceof z.ZodError
    ) {
      return Response.json({ error: "LOGIN_FAILED" }, { status: 400 });
    }
    return Response.json(
      { error: "UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
