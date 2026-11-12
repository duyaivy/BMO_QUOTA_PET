import { adminMutation, adminRead } from "@/server/http";
import { readDevice, saveDevice } from "@/server/devices/repository";
import { triggerDrainOutbox } from "@/server/mqtt/drain";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = () => adminRead(readDevice);
export const POST = async (request: Request) => {
  const response = await adminMutation(request, saveDevice);
  if (response.status === 200) {
    triggerDrainOutbox();
  }
  return response;
};
