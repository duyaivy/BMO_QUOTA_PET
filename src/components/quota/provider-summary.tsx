"use client";

import { useEffect, useState } from "react";
import { Activity, Box, CalendarDays, Layers3 } from "lucide-react";
import type { ProviderView, WindowView } from "@/contracts/dashboard";
import {
  freshnessLabel,
  formatPercent,
  providerMeta,
  quotaTone,
  remainingPercent,
  usableQuota,
} from "./presentation";

function useObservationClock(generatedAt: number) {
  const [now, setNow] = useState(generatedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function ObservationFreshness({
  windows,
  generatedAt,
  threshold,
}: {
  windows: WindowView[];
  generatedAt: number;
  threshold: number;
}) {
  const now = useObservationClock(generatedAt);
  const labels = windows.map(({ window }) =>
    freshnessLabel(window, now, threshold),
  );
  const label = !labels.length
    ? "Chưa có dữ liệu"
    : labels.includes("Dữ liệu cũ")
      ? "Dữ liệu cũ"
      : labels.includes("Chưa xác minh độ mới")
        ? "Chưa xác minh độ mới"
        : "Dữ liệu mới";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${label === "Dữ liệu mới" ? "bg-emerald-400/10 text-emerald-300" : label === "Dữ liệu cũ" ? "bg-amber-400/10 text-amber-300" : "bg-muted text-muted-foreground"}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
export function ProviderSummary({
  provider,
  generatedAt,
  threshold,
}: {
  provider: ProviderView;
  generatedAt: number;
  threshold: number;
}) {
  const now = useObservationClock(generatedAt);
  function average(duration: "5h" | "week") {
    if (!provider.enabled || provider.dataStatus !== "ok") return null;
    const values = provider.windows
      .filter((view) => {
        if (!usableQuota(view, now, threshold)) return false;
        const id = view.window.windowId;
        if (provider.providerId === "antigravity")
          return (
            duration === "5h"
              ? ["3p-5h", "gemini-5h"]
              : ["3p-weekly", "gemini-weekly"]
          ).includes(id);
        if (provider.providerId === "codex")
          return duration === "5h"
            ? id === "primary" || id.endsWith(".primary")
            : id === "secondary" || id.endsWith(".secondary");
        return id === (duration === "5h" ? "five_hour" : "seven_day");
      })
      .map((view) => remainingPercent(view.window)!);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }
  const short = average("5h"),
    week = average("week");
  const stats = [
    { label: "Nhà cung cấp", value: provider.name, Icon: Box },
    {
      label: "Mô hình được theo dõi",
      value: providerMeta[provider.providerId].models,
      Icon: Layers3,
    },
    {
      label: "Quota còn lại TB · 5 giờ",
      value: short === null ? "Chưa có dữ liệu" : formatPercent(short),
      Icon: Activity,
      percent: short,
    },
    {
      label: "Quota còn lại TB · tuần",
      value: week === null ? "Chưa có dữ liệu" : formatPercent(week),
      Icon: CalendarDays,
      percent: week,
    },
  ];
  return (
    <section aria-label="Tóm tắt nhà cung cấp" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex min-w-0 items-center gap-3 rounded-[14px] border border-border bg-gradient-to-br from-[#1c2137] to-[#141929] px-4 py-4"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <stat.Icon aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs leading-5 text-muted-foreground">
                {stat.label}
              </p>
              <p
                className={`mt-1 font-semibold ${stat.percent != null ? `text-2xl ${quotaTone(stat.percent) === "healthy" ? "text-emerald-300" : quotaTone(stat.percent) === "warning" ? "text-amber-300" : "text-rose-300"}` : "text-sm sm:text-base"}`}
              >
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <span>
          Trạng thái theo dõi:{" "}
          <span className="text-foreground">
            {provider.enabled ? "Nguồn đang bật" : "Nguồn đang tắt"}
          </span>
        </span>
        <span>
          Trung bình từ quota khả dụng, chưa quá hạn; độ mới nguồn được đánh giá
          riêng bên dưới.
        </span>
      </div>
    </section>
  );
}
