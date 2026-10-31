import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in | BMO Personal",
  description: "Sign in to the private BMO Personal workspace.",
};

export default function LoginPage() {
  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Sign in"
        description="Sign in with the owner password configured for this BMO instance."
      />
      <LoginForm />
    </>
  );
}
