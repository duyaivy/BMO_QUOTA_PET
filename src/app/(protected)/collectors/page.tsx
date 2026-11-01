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
                <div className="mt-5 space-y-4">
                  {collector.healthReports.length ? (
                    collector.healthReports.map((report) => (
                      <section
                        key={report.providerId}
                        className="rounded-lg border p-3"
                        aria-label={`${report.providerId} collector health`}
                      >
                        <div className="flex flex-wrap justify-between gap-2 text-sm font-medium">
                          <span>
                            {report.providerId} ·{" "}
                            {report.sourceVersion ?? "Version unknown"}
                          </span>
                          <Badge variant="outline">
                            {report.collectedAt > snapshot.generatedAt + 1000
                              ? "Health sample clock uncertain"
                              : snapshot.generatedAt - report.collectedAt >
                                  180000
                                ? "Health report stale"
                                : "Recent health report"}
                          </Badge>
                        </div>
                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">
                              Health sampled
                            </dt>
                            <dd>{timestamp(report.collectedAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Source input
                            </dt>
                            <dd>
                              {report.sourceAvailability} ·{" "}
                              {report.health.sourceCode}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Upload queue
                            </dt>
                            <dd>
                              {report.health.queuePending} pending ·{" "}
                              {report.health.queueBytes} bytes
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Dropped events
                            </dt>
                            <dd>{report.health.dropped}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Callback spool
                            </dt>
                            <dd>
                              {report.health.callbackPending ?? "Unknown"}{" "}
                              pending ·{" "}
                              {report.health.callbackBytes ?? "Unknown"} bytes ·{" "}
                              {report.health.callbackDropped ?? "Unknown"}{" "}
                              dropped
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Uploader</dt>
                            <dd>{report.health.lastUploadCode}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Next queued retry
                            </dt>
                            <dd>
                              {report.health.nextRetryAt ?? "None reported"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Paused sources
                            </dt>
                            <dd>
                              {report.health.pausedSources.join(", ") ||
                                "None reported"}
                            </dd>
                          </div>
                        </dl>
                      </section>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No collector health report received.
                    </p>
                  )}
                </div>
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
          source age. Health reports are captured locally and can themselves be
          stale after offline delivery. A readable session directory or silence
          does not prove that a CLI is running or closed.
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
