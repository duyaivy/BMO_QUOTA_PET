import { randomUUID } from "node:crypto";
import { verifyWeatherTrigger } from "@/server/weather/trigger-auth";
import { runWeatherJob } from "@/server/weather/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const allow = "GET, HEAD, OPTIONS";
function headers(result: string, requestId: string): HeadersInit {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-BMO-Weather-Result": result,
    "X-Request-Id": requestId,
  };
}
async function handle(request: Request, head: boolean): Promise<Response> {
  const requestId = randomUUID();
  const auth = verifyWeatherTrigger(request);
  if (auth !== "authorized") {
    const status = auth === "misconfigured" ? 503 : 401;
    return head
      ? new Response(null, { status, headers: headers(auth, requestId) })
      : Response.json(
          {
            error: {
              code: auth === "misconfigured" ? "MISCONFIGURED" : "UNAUTHORIZED",
            },
            requestId,
          },
          { status, headers: headers(auth, requestId) },
        );
  }
  try {
    const result = await runWeatherJob({ deadlineMs: Date.now() + 25000 });
    const status = result.status === "failed" ? 503 : 200;
    return head
      ? new Response(null, {
          status,
          headers: headers(result.status, requestId),
        })
      : Response.json(
          { data: { ...result, requestId }, requestId },
          { status, headers: headers(result.status, requestId) },
        );
  } catch {
    return head
      ? new Response(null, {
          status: 503,
          headers: headers("failed", requestId),
        })
      : Response.json(
          { error: { code: "TEMPORARY_FAILURE" }, requestId },
          { status: 503, headers: headers("failed", requestId) },
        );
  }
}
export async function HEAD(request: Request): Promise<Response> {
  return handle(request, true);
}
export async function GET(request: Request): Promise<Response> {
  return handle(request, false);
}
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: { ...headers("options", randomUUID()), Allow: allow },
  });
}
export async function POST(): Promise<Response> {
  return new Response(null, {
    status: 405,
    headers: { ...headers("method_not_allowed", randomUUID()), Allow: allow },
  });
}
