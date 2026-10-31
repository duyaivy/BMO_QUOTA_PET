import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ProviderQuotaCard } from "@/components/quota/provider-card";
import { RefreshButton } from "@/components/quota/refresh-button";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Overview | BMO Personal",
  description: "Persisted quota observations and source status.",
};

export default async function OverviewPage() {
  const snapshot = await readDashboard();
  const hasObservations = snapshot.providers.some(
    (provider) => provider.windows.length > 0,
  );
  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Your quota at a glance"
        description="Quota values come from persisted local observations. Refreshing this page reads application data only; it does not contact provider services."
      >
        <RefreshButton />
      </PageHeader>
      <section aria-label="Provider quota observations" className="grid gap-4">
        {snapshot.providers.map((provider) => (
          <ProviderQuotaCard
            key={provider.providerId}
            provider={provider}
            generatedAt={snapshot.generatedAt}
            freshnessThresholdSeconds={snapshot.freshnessThresholdSeconds}
          />
        ))}
      </section>
      {!hasObservations ? (
        <EmptyState
          title="No quota observations yet"
          description="No persisted quota windows are available. Missing data is unknown; it does not mean zero usage."
        />
      ) : null}
    </>
  );
}
