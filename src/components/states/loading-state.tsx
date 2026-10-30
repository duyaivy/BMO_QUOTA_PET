import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({
  label = "Loading content",
}: {
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <span className="sr-only">{label}</span>
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-4 w-full max-w-md" />
        <Skeleton className="mt-7 h-2 w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    </div>
  );
}
