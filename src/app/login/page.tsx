import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { UnavailableState } from "@/components/states/unavailable-state";

export const metadata: Metadata = {
  title: "Sign in | BMO Personal",
  description: "Authentication is not implemented in this application preview.",
};

export default function LoginPage() {
  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Sign in"
        description="Owner authentication has not been implemented."
      />
      <UnavailableState
        title="Authentication is unavailable"
        description="This page is a placeholder. It does not accept credentials or create a session."
      />
    </>
  );
}
