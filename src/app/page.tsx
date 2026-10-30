import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Overview | BMO Personal",
  description: "A private overview of configured quota sources and devices.",
};

const providers = ["Codex", "Claude Code", "Antigravity"];

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Your quota at a glance"
        description="BMO shows observations only after a supported local source is configured. No quota readings are available yet."
      />
      <section
        aria-label="Provider status"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {providers.map((provider) => (
          <Card key={provider}>
            <CardHeader>
              <CardTitle>{provider}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Integration unverified
              </p>
              <p className="mt-2 text-sm">No quota observation available.</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <EmptyState
        title="No quota observations yet"
        description="Provider sources and collection are not configured. Missing data is unknown; it does not mean zero usage."
      >
        <Link
          className="text-sm font-medium underline underline-offset-4"
          href="/settings/providers"
        >
          Review provider setup
        </Link>
      </EmptyState>
    </>
  );
}
