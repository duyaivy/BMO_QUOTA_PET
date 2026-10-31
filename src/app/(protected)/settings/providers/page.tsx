import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProviderToggle } from "@/components/settings/provider-toggle";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Provider settings | BMO Personal",
  description: "Provider source verification and setup status.",
};
const guidance: Record<string, string> = {
  codex:
    "Codex session observation is a candidate. Installed formats and source behavior remain unverified.",
  claude:
    "Claude Code native statusline input is a candidate. Installed support and quota timing remain unverified.",
  antigravity:
    "Antigravity native statusline input is a candidate. Installed support and quota timing remain unverified.",
};

export default async function ProviderSettingsPage() {
  const snapshot = await readDashboard();
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Provider sources"
        description="BMO does not sign in to provider accounts or handle provider credentials. Sign-in remains in each official client."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {snapshot.providers.map((provider) => (
          <Card
            key={provider.providerId}
            role="region"
            aria-label={provider.name + " source settings"}
          >
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{provider.name}</CardTitle>
                <Badge variant="outline">
                  {provider.verification === "unverified"
                    ? "Integration unverified"
                    : provider.verification}
                </Badge>
              </div>
              <CardDescription>{guidance[provider.providerId]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {provider.synthetic ? (
                <Badge variant="secondary">Synthetic fixtures</Badge>
              ) : null}
              <dl className="grid gap-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">Source type</dt>
                  <dd>{provider.sourceType ?? "Not configured"}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">
                    Ownership generation
                  </dt>
                  <dd>{provider.ownershipGeneration}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">
                    Authoritative collector
                  </dt>
                  <dd>{provider.collectorId ?? "None"}</dd>
                </div>
              </dl>
              <ProviderToggle
                provider={provider}
                expectedRevision={snapshot.settingsRevision}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Fixture-local setup is synthetic-only. Use the local collector setup
        guide; never enter provider credentials here.
      </p>
      <Link
        className="text-sm font-medium underline underline-offset-4"
        href="/collectors"
      >
        View collector status
      </Link>
    </>
  );
}
