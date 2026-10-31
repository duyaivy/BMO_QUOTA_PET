import { getCsrfFromCookie, issueCsrfToken } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const existing = await getCsrfFromCookie();
    const token = existing ?? (await issueCsrfToken());
    return Response.json(
      { csrfToken: token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Validate runtime configuration at the request boundary; expose no values.
    return Response.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}
