"use client";

import { useEffect, useState } from "react";
import { effectiveWindow, type QuotaWindow } from "@/contracts/usage";
import type { DataStatus } from "@/contracts/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function absoluteTime(value: string | null) {
  return value
    ? new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC")
    : "Chưa xác định";
}
function remainingLabel(seconds: number) {
  if (seconds <= 0) return "Đã quá thời gian đặt lại";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days) return `Còn ${days} ngày ${hours} giờ sẽ đặt lại`;
  if (hours) return `Còn ${hours} giờ ${minutes} phút sẽ đặt lại`;
  if (minutes) return `Còn ${minutes} phút ${secs} giây sẽ đặt lại`;
  return `Còn ${secs} giây sẽ đặt lại`;
}
function durationLabel(seconds: number | null) {
  if (seconds === null) return "Thời hạn chưa xác định";
  if (seconds % 86400 === 0) return `Khung ${seconds / 86400} ngày`;
  if (seconds % 3600 === 0) return `Khung ${seconds / 3600} giờ`;
  if (seconds % 60 === 0) return `Khung ${seconds / 60} phút`;
  return `Khung ${seconds} giây`;
}
function availabilityLabel(status: DataStatus) {
  return {
    ok: "Khả dụng",
    unavailable: "Không khả dụng",
    unsupported: "Không hỗ trợ",
    error: "Lỗi nguồn",
  }[status];
}

export function WindowViewCard({
  window,
  availability,
  thresholdSeconds,
  generatedAt,
  sourceEnabled,
}: {
  window: QuotaWindow;
  availability: DataStatus;
  thresholdSeconds: number;
  generatedAt: number;
  sourceEnabled: boolean;
}) {
  const [now, setNow] = useState(generatedAt);
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(timer);
  }, []);
  const effective = effectiveWindow(window, now, thresholdSeconds);
  const expired = effective.resetExpired;
  const sourceAvailable = availability === "ok" && sourceEnabled;
  const stale = effective.effectiveFreshness === "stale";
  const barAvailable = sourceAvailable && !expired && !stale;
  const used =
    window.usedPercent ??
    (window.remainingPercent === null ? null : 100 - window.remainingPercent);
  const sourceState = sourceEnabled
    ? availabilityLabel(availability).toLowerCase()
    : "nguồn đang tắt";
  const freshness = expired
    ? `Đã hết hạn · giá trị gần nhất${sourceAvailable ? "" : `; ${sourceState}`}`
    : !sourceAvailable
      ? `Giá trị gần nhất · ${sourceState}`
      : stale
        ? "Dữ liệu cũ · giá trị gần nhất"
        : effective.effectiveFreshness === "fresh"
          ? "Mới theo dấu thời gian nguồn"
          : "Tuổi dữ liệu nguồn chưa xác định";
  const statusLabel = expired
    ? "Hết hạn"
    : !sourceEnabled
      ? "Đã tắt"
      : !sourceAvailable
        ? availabilityLabel(availability)
        : stale
          ? "Cũ"
          : effective.effectiveFreshness === "unknown"
            ? "Chưa rõ tuổi"
            : "Khả dụng";
  return (
    <Card
      role="group"
      aria-label={`Khung hạn mức ${window.label}`}
      className="gap-4 py-4 shadow-none"
    >
      <CardHeader className="gap-1 px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm">{window.label}</CardTitle>
          <Badge
            variant={
              expired || !sourceAvailable
                ? "outline"
                : stale
                  ? "secondary"
                  : "default"
            }
          >
            {statusLabel}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {durationLabel(window.windowDurationSeconds)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xl font-semibold tabular-nums">
            {used === null ? "Chưa xác định" : `${used}%`}
          </span>
          <span className="text-right text-xs text-muted-foreground">
            {freshness}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Mức sử dụng ${window.label}`}
          aria-valuemin={barAvailable && used !== null ? 0 : undefined}
          aria-valuemax={barAvailable && used !== null ? 100 : undefined}
          aria-valuenow={barAvailable && used !== null ? used : undefined}
          aria-valuetext={
            barAvailable && used !== null
              ? `Đã dùng ${used}%`
              : `${freshness}; phần trăm không khả dụng`
          }
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          {barAvailable && used !== null ? (
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${used}%` }}
            />
          ) : (
            <div className="h-full w-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Độ mới nguồn:{" "}
          {effective.effectiveFreshness === "unknown"
            ? "tuổi dữ liệu nguồn chưa xác định"
            : effective.effectiveFreshness === "stale"
              ? "dữ liệu cũ"
              : "mới theo dấu thời gian nguồn"}
        </p>
        <dl className="grid gap-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>Thời điểm ghi nhận</dt>
            <dd>
              <time dateTime={window.collectedAt}>
                {absoluteTime(window.collectedAt)}
              </time>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Thời điểm nguồn quan sát</dt>
            <dd>
              {window.upstreamObservedAt ? (
                <time dateTime={window.upstreamObservedAt}>
                  {absoluteTime(window.upstreamObservedAt)}
                </time>
              ) : (
                "Chưa xác định"
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Thời gian đặt lại</dt>
            <dd>
              {window.resetAt ? (
                <time dateTime={window.resetAt}>
                  {absoluteTime(window.resetAt)}
                </time>
              ) : (
                "Chưa xác định"
              )}
            </dd>
          </div>
          {window.resetAt ? (
            <div className="text-right">
              {remainingLabel(
                Math.floor((Date.parse(window.resetAt) - now) / 1000),
              )}
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}
