import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = {
  title: "Collectors | BMO Personal",
  description: "Local collector enrollment and observation status.",
};

export default function CollectorsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Collection"
        title="Collectors"
        description="Collectors observe permitted local CLI output and upload quota-only observations. They do not fetch quota from provider services."
      />
      <EmptyState
        title="No collectors enrolled"
        description="No local collector is connected. Upload health and source observation activity are separate signals, and both are currently unknown."
      >
        <p className="text-sm text-muted-foreground">
          Upload transport is not configured. No upload or capture has been
          recorded.
        </p>
      </EmptyState>
      <section
        className="rounded-xl border bg-card p-5 sm:p-6"
        aria-labelledby="collector-boundary-title"
      >
        <h2 id="collector-boundary-title" className="font-semibold">
          Upload and capture are different
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          An upload confirms delivery of an observation; it does not prove that
          a provider supplied a new quota reading. BMO has no collector data to
          report yet.
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
