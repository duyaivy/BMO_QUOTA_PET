import { after } from "next/server";
import { adminRead, adminMutation } from "@/server/http";
import { requireAdmin } from "@/server/auth";
import {
  readWeatherSettings,
  saveWeatherLocation,
} from "@/server/weather/settings";
import { admitWeatherLookup } from "@/server/weather/rate-limit";
import { runWeatherJob } from "@/server/weather/refresh";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(): Promise<Response> {
  return adminRead(readWeatherSettings);
}
export async function POST(request: Request): Promise<Response> {
  return adminMutation(request, async (input) => {
    const session = await requireAdmin();
    await admitWeatherLookup(session.handleHash);
    const result = await saveWeatherLocation(input);
    if (result.changed)
      after(async () => {
        await runWeatherJob({ deadlineMs: Date.now() + 25000 });
      });
    return result.settings;
  });
}
