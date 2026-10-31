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
          "Could not verify this change. Refresh the page and try again.",
        );
      const { csrfToken } = (await csrfResponse.json()) as {
        csrfToken?: string;
      };
      if (!csrfToken)
        throw new Error(
          "Could not verify this change. Refresh the page and try again.",
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
            "Settings changed. Your change was not saved; refresh and try again.",
          );
        throw new Error(
          result?.error?.message || "This setting could not be saved.",
        );
      }
      setMessage("Provider setting saved.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This setting could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {provider.enabled
          ? "Observation is enabled for this source."
          : "Observation is disabled for this source."}
      </p>
      <Button
        type="button"
        variant={provider.enabled ? "outline" : "default"}
        disabled={busy}
        onClick={() => void update(!provider.enabled)}
      >
        {busy
          ? "Saving…"
          : provider.enabled
            ? "Disable source"
            : "Enable source"}
      </Button>
      {message ? (
        <p className="text-sm" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
