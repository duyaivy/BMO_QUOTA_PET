import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AuthError,
  checkOrigin,
  requireAdmin,
  requireCsrf,
} from "@/server/auth";
import { RevisionConflict } from "@/server/devices/repository";
import { parseStrictJson } from "@/server/ingestion/json";
const headers = { "Cache-Control": "no-store" };
function errorResponse(error: unknown, requestId: string) {
  const code =
    error instanceof AuthError
      ? error.code
      : error instanceof RevisionConflict
        ? "REVISION_CONFLICT"
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? "INVALID_PAYLOAD"
          : error instanceof RangeError
            ? "PAYLOAD_TOO_LARGE"
            : "TEMPORARY_FAILURE";
  const status =
    error instanceof AuthError
      ? error.status
      : error instanceof RevisionConflict
        ? 409
        : code === "INVALID_PAYLOAD"
          ? 400
          : code === "PAYLOAD_TOO_LARGE"
            ? 413
            : 503;
  return Response.json(
    {
      error: {
        code,
        message:
          status === 409
            ? "Configuration changed; refresh before saving"
            : status === 503
              ? "Temporarily unavailable"
              : "Request rejected",
      },
      requestId,
    },
    { status, headers },
  );
}
export async function adminRead(action: () => Promise<unknown>) {
  const requestId = randomUUID();
  try {
    await requireAdmin();
    return Response.json({ data: await action(), requestId }, { headers });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
export async function adminMutation(
  request: Request,
  action: (input: unknown) => Promise<unknown>,
) {
  const requestId = randomUUID();
  try {
    await checkOrigin(request);
    await requireAdmin();
    await requireCsrf(request.headers.get("X-CSRF-Token"));
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json" ||
      request.headers.has("content-encoding")
    )
      throw new AuthError("UNSUPPORTED_MEDIA_TYPE", 415);
    if (!request.body) throw new SyntaxError();
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 8192) {
          await reader.cancel();
          throw new RangeError();
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    let input: unknown;
    try {
      input = parseStrictJson(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch {
      throw new SyntaxError();
    }
    return Response.json({ data: await action(input), requestId }, { headers });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
