"use client";

import { ErrorState } from "@/components/states/error-state";

export default function Error({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return <ErrorState onRetry={retry} />;
}
