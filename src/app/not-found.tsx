import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";

export default function NotFound() {
  return (
    <>
      <PageHeader
        title="Page not found"
        description="This page is not part of your workspace."
      />
      <Link href="/" className="font-medium underline underline-offset-4">
        Return to overview
      </Link>
    </>
  );
}
