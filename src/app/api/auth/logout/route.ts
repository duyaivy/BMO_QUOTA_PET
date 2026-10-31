import { AuthError, checkOrigin, logout, requireCsrf } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await checkOrigin(request);
    await requireCsrf(request.headers.get("x-csrf-token"));
    await logout();
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthError)
      return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}
