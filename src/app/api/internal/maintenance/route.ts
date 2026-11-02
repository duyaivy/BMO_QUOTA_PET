import { NextResponse } from "next/server";
import {
  runMaintenance,
  verifyMaintenanceSecret,
} from "@/server/maintenance";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authHeader =
    request.headers.get("authorization") ||
    request.headers.get("x-bmo-maintenance-secret");

  if (!verifyMaintenanceSecret(authHeader)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid maintenance secret" } },
      { status: 401 },
    );
  }

  try {
    const result = await runMaintenance();
    return NextResponse.json({ ok: true, data: result });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: "MAINTENANCE_FAILED",
          message: err?.message ?? "Maintenance execution failed",
        },
      },
      { status: 500 },
    );
  }
}
