import { adminMutation, adminRead } from "@/server/http";
import { readDevice, saveDevice } from "@/server/devices/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = () => adminRead(readDevice);
export const POST = (request: Request) => adminMutation(request, saveDevice);
