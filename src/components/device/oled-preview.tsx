"use client";
import { useEffect, useState } from "react";
import type { DeviceScreen, ProviderView } from "@/contracts/dashboard";
import { effectiveWindow } from "@/contracts/usage";

export function OledPreview({
  screen,
  providers,
  generatedAt,
  freshnessThresholdSeconds,
}: {
  screen: DeviceScreen;
  providers: ProviderView[];
  generatedAt: number;
  freshnessThresholdSeconds: number;
}) {
  const [now, setNow] = useState(generatedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  let title = "BMO";
  let value = "READY";
  let detail = "HOME";
  if (screen.kind === "quota") {
    const provider = providers.find(
      (item) => item.providerId === screen.providerId,
    );
    const item = provider?.windows.find(
      ({ window }) => window.windowId === screen.windowId,
    );
    title = provider?.name ?? "Quota";
    if (!item) {
      value = "—";
      detail = "Unavailable";
    } else {
      const effective = effectiveWindow(
        item.window,
        now,
        freshnessThresholdSeconds,
      );
      const percent =
        item.window.usedPercent ??
        (item.window.remainingPercent === null
          ? null
          : 100 - item.window.remainingPercent);
      value = percent === null ? "—" : `${percent}%`;
      detail = effective.resetExpired
        ? "Expired · last known"
        : item.availability !== "ok"
          ? "Source unavailable"
          : effective.effectiveFreshness === "stale"
            ? "Stale · last known"
            : effective.effectiveFreshness === "unknown"
              ? "Age unknown"
              : "Observed";
    }
  }
  return (
    <div className="max-w-full rounded-xl border bg-muted p-3">
      <svg
        width="128"
        height="64"
        viewBox="0 0 128 64"
        role="img"
        aria-label="OLED 128 by 64 configuration preview"
        className="mx-auto h-auto w-full max-w-64 rounded border border-foreground/70 bg-background p-1 font-mono text-foreground"
      >
        <rect
          x="0"
          y="0"
          width="128"
          height="64"
          rx="3"
          fill="currentColor"
          className="text-background"
        />
        <text
          x="6"
          y="14"
          fontSize="9"
          fill="currentColor"
          className="text-foreground"
        >
          {title.slice(0, 20)}
        </text>
        <line
          x1="6"
          y1="19"
          x2="122"
          y2="19"
          stroke="currentColor"
          className="text-muted-foreground"
        />
        <text
          x="6"
          y="42"
          fontSize="18"
          fontWeight="bold"
          fill="currentColor"
          className="text-foreground"
        >
          {value.slice(0, 12)}
        </text>
        <text
          x="6"
          y="56"
          fontSize="8"
          fill="currentColor"
          className="text-muted-foreground"
        >
          {detail.slice(0, 22)}
        </text>
      </svg>
      {screen.kind === "quota" &&
      providers.find((provider) => provider.providerId === screen.providerId)
        ?.synthetic ? (
        <p className="text-xs">Synthetic fixture data</p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Configuration aid only. MQTT and hardware output are not verified.
      </p>
    </div>
  );
}
