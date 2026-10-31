import Link from "next/link";
import type { ProviderView } from "@/contracts/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WindowViewCard } from "@/components/quota/window-view";

export function ProviderQuotaCard({
  provider,
  generatedAt,
  freshnessThresholdSeconds,
}: {
  provider: ProviderView;
  generatedAt: number;
  freshnessThresholdSeconds: number;
}) {
  return (
    <Card role="region" aria-label={provider.name + " quota"}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle>{provider.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {provider.enabled ? "Source enabled" : "Source disabled"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {provider.verification === "unverified"
                ? "Integration unverified"
                : "Integration " + provider.verification}
            </Badge>
            {provider.synthetic ? (
              <Badge variant="secondary">Synthetic fixtures</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {provider.dataStatus !== "ok" ? (
          <p className="text-sm">
            {provider.dataStatus === "unsupported"
              ? "Unsupported"
              : provider.dataStatus === "error"
                ? "Source error"
                : "Quota unavailable"}
          </p>
        ) : null}
        {provider.windows.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {provider.windows.map(({ window, availability }) => (
              <WindowViewCard
                key={`${window.windowId}:${window.collectedAt}`}
                window={window}
                availability={availability}
                thresholdSeconds={freshnessThresholdSeconds}
                generatedAt={generatedAt}
                sourceEnabled={provider.enabled}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No quota observation available. Missing data is unknown, not zero.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Provider sign-in remains in the official client.{" "}
          <Link
            className="underline underline-offset-4"
            href="/settings/providers"
          >
            Review source settings
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
