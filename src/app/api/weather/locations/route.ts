import { adminRead } from "@/server/http";
import { requireAdmin } from "@/server/auth";
import { admitWeatherLookup } from "@/server/weather/rate-limit";
import { searchWeatherLocations } from "@/server/weather/locations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  return adminRead(async () => {
    const session = await requireAdmin();
    await admitWeatherLookup(session.handleHash);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return searchWeatherLocations(query, request.signal);
  });
}
