import { ingest } from "@/server/ingestion";
import { triggerDrainOutbox } from "@/server/mqtt/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  const response = await ingest(request);
  if (response.status === 200) {
    triggerDrainOutbox();
  }
  return response;
};
