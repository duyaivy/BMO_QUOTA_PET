import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceEditor } from "@/components/device/device-editor";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Devices | BMO Personal",
  description: "Configure ordered BMO display screens.",
};

export default async function DevicesPage() {
  const snapshot = await readDashboard();
  return (
    <>
      <PageHeader
        eyebrow="Devices"
        title="BMO displays"
        description="Arrange the local display configuration and preview it at OLED dimensions. Saving settings does not confirm broker delivery or hardware connectivity."
      />
      <Card className="mb-5 border-dashed shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Display connection status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            MQTT broker delivery, device reachability, and physical display
            output are not implemented or verified.
          </p>
        </CardContent>
      </Card>
      <DeviceEditor
        initialDevice={snapshot.device}
        providers={snapshot.providers}
        generatedAt={snapshot.generatedAt}
        freshnessThresholdSeconds={snapshot.freshnessThresholdSeconds}
      />
      <Link
        className="mt-5 inline-block text-sm font-medium underline underline-offset-4"
        href="/status"
      >
        View operations status
      </Link>
    </>
  );
}
