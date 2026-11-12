import { adminMutation } from "@/server/http";
import { createDevice } from "@/server/devices/repository";
import { triggerDrainOutbox } from "@/server/mqtt/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  const response = await adminMutation(request, createDevice);
  if (response.status === 200) {
    triggerDrainOutbox();
  }
  return response;
};
