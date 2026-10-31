import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshButton } from "@/components/quota/refresh-button";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Collectors | BMO Personal",
  description: "Local collector enrollment and observation status.",
};
function timestamp(value: number | null) {
  return value === null
    ? "Unknown"
    : new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export default async function CollectorsPage() {
  const snapshot = await readDashboard();
  return (
    <>
      <PageHeader
        eyebrow="Collection"
        title="Collectors"
        description="Upload delivery and quota observation are separate signals. Neither implies a new provider reading."
      >
        <RefreshButton />
      </PageHeader>
      {snapshot.collectors.length ? (
        <section
          className="grid gap-4 lg:grid-cols-2"
          aria-label="Enrolled collectors"
        >
          {snapshot.collectors.map((collector) => (
            <Card key={collector.collectorId}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{collector.name}</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant={collector.active ? "default" : "outline"}>
                      {collector.active ? "Enrolled" : "Revoked"}
                    </Badge>
                    {collector.synthetic ? (
                      <Badge variant="secondary">Synthetic fixtures</Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">
                      Last successful upload
                    </dt>
                    <dd className="mt-1">{timestamp(collector.lastSeenAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last source event</dt>
                    <dd className="mt-1">
                      {timestamp(collector.lastSourceEventAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Last observation captured
                    </dt>
                    <dd className="mt-1">
                      {timestamp(collector.lastObservationCaptureAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Last quota window captured
                    </dt>
                    <dd className="mt-1">
                      {timestamp(collector.lastQuotaCaptureAt)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <EmptyState
          title="No collectors enrolled"
          description="No local collector is connected. Upload reachability and quota capture are unknown."
        />
      )}
      <section
        className="rounded-xl border bg-card p-5 sm:p-6"
        aria-labelledby="collector-boundary-title"
      >
        <h2 id="collector-boundary-title" className="font-semibold">
          Upload is not a quota refresh
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The timestamps above show when BMO last heard from a collector and
          when an observation was captured. Delivery does not refresh quota
          source age.
        </p>
      </section>
      <Link
        className="text-sm font-medium underline underline-offset-4"
        href="/settings/providers"
      >
        Review provider sources
      </Link>
    </>
  );
}
