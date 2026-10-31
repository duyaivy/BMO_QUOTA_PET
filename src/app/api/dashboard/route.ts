import { adminRead } from "@/server/http";
import { readDashboard } from "@/server/quota/queries";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = () => adminRead(readDashboard);
