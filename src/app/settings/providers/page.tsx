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

export const metadata: Metadata = {
  title: "Provider settings | BMO Personal",
  description: "Provider source verification and setup status.",
};

const providers = [
  {
    name: "Codex",
    source:
      "Local session observation is a candidate; installed data format is unverified.",
  },
  {
    name: "Claude Code",
    source:
      "Native statusline input is a candidate; installed support is unverified.",
  },
  {
    name: "Antigravity",
    source:
      "Native statusline input is a candidate; installed support is unverified.",
  },
];

export default function ProviderSettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Provider sources"
        description="BMO does not sign in to providers or handle provider credentials. Sign-in remains in each official CLI."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {providers.map((provider) => (
          <Card key={provider.name}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{provider.name}</CardTitle>
                <Badge variant="outline">Unverified</Badge>
              </div>
              <CardDescription>{provider.source}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No source is configured or verified.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Local setup guidance will be available after source compatibility is
        verified. No provider sign-in or token form is provided.
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
