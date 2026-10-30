import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { UnavailableState } from "@/components/states/unavailable-state";

export const metadata: Metadata = {
  title: "Operations status | BMO Personal",
  description: "Availability of BMO operational services.",
};

export default function StatusPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Service status"
        description="Operational checks will report configured service state when those services are implemented."
      />
      <UnavailableState
        title="Service checks are unavailable"
        description="Database, ingestion, maintenance, and message delivery services are not configured. No health checks have run, so their status is unknown."
      />
    </>
  );
}
