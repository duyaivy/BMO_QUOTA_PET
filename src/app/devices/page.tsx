import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";

export const metadata: Metadata = {
  title: "Devices | BMO Personal",
  description: "Configured BMO display devices.",
};

export default function DevicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Devices"
        title="BMO displays"
        description="Configure display pages for enrolled hardware when device support is available."
      />
      <EmptyState
        title="No devices configured"
        description="There are no registered BMO displays. MQTT delivery and hardware connectivity are not configured."
      >
        <p className="text-sm text-muted-foreground">
          No device state or connection status is available.
        </p>
      </EmptyState>
      <section
        className="rounded-xl border bg-card p-5 sm:p-6"
        aria-labelledby="device-setup-title"
      >
        <h2 id="device-setup-title" className="font-semibold">
          Device setup is not available yet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Device configuration, broker delivery, and hardware preview are not
          connected in this version.
        </p>
      </section>
      <Link
        className="text-sm font-medium underline underline-offset-4"
        href="/status"
      >
        View operations status
      </Link>
    </>
  );
}
