import { adminRead } from "@/server/http";
import { getDeviceProvisioningInfo } from "@/server/devices/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) =>
  adminRead(async () => {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("deviceId") || "bmo-local";
    return getDeviceProvisioningInfo(deviceId);
  });
