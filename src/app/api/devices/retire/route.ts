import { adminMutation } from "@/server/http";
import { retireDevice } from "@/server/devices/repository";
import { triggerDrainOutbox } from "@/server/mqtt/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  const response = await adminMutation(request, retireDevice);
  if (response.status === 200) {
    triggerDrainOutbox();
  }
  return response;
};
