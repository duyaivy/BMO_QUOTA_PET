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
  let value = "SẴN SÀNG";
  let detail = "TRANG CHỦ";
  if (screen.kind === "quota") {
    const provider = providers.find(
      (item) => item.providerId === screen.providerId,
    );
    const item = provider?.windows.find(
      ({ window }) => window.windowId === screen.windowId,
    );
    title = provider?.name ?? "Hạn mức";
    if (!item) {
      value = "—";
      detail = "Không khả dụng";
    } else {
      const effective = effectiveWindow(
        item.window,
        now,
        freshnessThresholdSeconds,
      );
      const remaining =
        item.window.remainingPercent !== null &&
        item.window.remainingPercent !== undefined
          ? Math.round(item.window.remainingPercent)
          : item.window.usedPercent !== null &&
              item.window.usedPercent !== undefined
            ? Math.round(100 - item.window.usedPercent)
            : null;
      value = remaining === null ? "—" : `${remaining}%`;
      detail = effective.resetExpired
        ? "Hết hạn · gần nhất"
        : item.availability !== "ok"
          ? "Nguồn không khả dụng"
          : effective.effectiveFreshness === "stale"
            ? "Dữ liệu cũ · gần nhất"
            : effective.effectiveFreshness === "unknown"
              ? "Chưa rõ tuổi"
              : `CÒN LẠI ${value}`;
    }
  }
  return (
    <div className="max-w-full rounded-xl border bg-muted p-3">
      <svg
        width="128"
        height="64"
        viewBox="0 0 128 64"
        role="img"
        aria-label="Xem trước cấu hình OLED 128x64"
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
        <p className="text-xs">Dữ liệu mẫu mô phỏng</p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Chỉ dùng hỗ trợ cấu hình. Chưa xác minh MQTT và hiển thị phần cứng.
      </p>
    </div>
  );
}
