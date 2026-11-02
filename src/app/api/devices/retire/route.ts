import { adminMutation } from "@/server/http";
import { retireDevice } from "@/server/devices/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request) => adminMutation(request, retireDevice);
