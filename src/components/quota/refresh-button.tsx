"use client";

import { useEffect, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RefreshButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return (
    <Button
      variant="outline"
      size={compact ? "icon" : "default"}
      title="Làm mới dữ liệu ứng dụng đã lưu"
      aria-label="Làm mới dữ liệu ứng dụng"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw aria-hidden="true" className={pending ? "animate-spin" : ""} />
      {!compact && "Làm mới dữ liệu ứng dụng"}
    </Button>
  );
}
