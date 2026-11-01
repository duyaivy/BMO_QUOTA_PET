"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return (
    <Button variant="outline" onClick={() => router.refresh()}>
      Làm mới dữ liệu ứng dụng
    </Button>
  );
}
