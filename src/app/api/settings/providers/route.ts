import { adminMutation } from "@/server/http";
import { saveProvider } from "@/server/devices/repository";
export const runtime = "nodejs";
export const POST = (request: Request) => adminMutation(request, saveProvider);
