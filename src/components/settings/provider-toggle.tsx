"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ProviderView } from "@/contracts/dashboard";

export function ProviderToggle({
  provider,
  expectedRevision,
}: {
  provider: ProviderView;
  expectedRevision: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function update(enabled: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok)
        throw new Error(
          "Không thể xác minh thay đổi này. Hãy tải lại trang và thử lại.",
        );
      const { csrfToken } = (await csrfResponse.json()) as {
        csrfToken?: string;
      };
      if (!csrfToken)
        throw new Error(
          "Không thể xác minh thay đổi này. Hãy tải lại trang và thử lại.",
        );
      const response = await fetch("/api/settings/providers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          providerId: provider.providerId,
          enabled,
          expectedRevision,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      if (!response.ok) {
        if (response.status === 409)
          throw new Error(
            "Cài đặt đã thay đổi. Thay đổi của bạn chưa được lưu; hãy tải lại trang và thử lại.",
          );
        throw new Error(
          result?.error?.message || "Không thể lưu cài đặt này.",
        );
      }
      setMessage("Đã lưu cài đặt nhà cung cấp.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Không thể lưu cài đặt này.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {provider.enabled
          ? "Quan sát đang được bật cho nguồn này."
          : "Quan sát đang bị tắt cho nguồn này."}
      </p>
      <Button
        type="button"
        variant={provider.enabled ? "outline" : "default"}
        disabled={busy}
        onClick={() => void update(!provider.enabled)}
      >
        {busy
          ? "Đang lưu…"
          : provider.enabled
            ? "Tắt nguồn"
            : "Bật nguồn"}
      </Button>
      {message ? (
        <p className="text-sm" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
