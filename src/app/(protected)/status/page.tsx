import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Operations status | BMO Personal",
  description: "Availability of BMO operational services.",
};
export default async function StatusPage() {
  const snapshot = await readDashboard();
  const items = [
    {
      name: "Application database",
      status: "Available",
      detail: "Persisted dashboard data was read successfully for this page.",
    },
    {
      name: "Usage ingestion",
      status: "Available",
      detail:
        "The application ingestion route is configured. This does not verify external delivery.",
    },
    {
      name: "Provider integrations",
      status: "Unverified",
      detail:
        "Provider quota formats and native source behavior remain unverified.",
    },
    {
      name: "MQTT broker",
      status: "Pending",
      detail: "Broker configuration and connectivity are not implemented.",
    },
    {
      name: "Hardware and deployment",
      status: "Pending",
      detail: "No hardware connection or production deployment check has run.",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Service status"
        description={`Local application state read at ${new Date(snapshot.generatedAt).toISOString()}. No provider polling or broker health check was performed.`}
      />
      <section
        className="grid gap-4 md:grid-cols-2"
        aria-label="Application service status"
      >
        {items.map((item) => (
          <Card key={item.name}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{item.name}</CardTitle>
                <Badge
                  variant={
                    item.status === "Available" ? "secondary" : "outline"
                  }
                >
                  {item.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
}
