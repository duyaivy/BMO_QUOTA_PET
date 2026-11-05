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
  if (days) return `Đặt lại sau ${days} ngày, ${hours} giờ`;
  if (hours) return `Đặt lại sau ${hours} giờ, ${minutes} phút`;
  if (minutes) return `Đặt lại sau ${minutes} phút`;
  return `Đặt lại sau ${secs} giây`;
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

function formatWindowMetadata(
  providerId: string | undefined,
  window: QuotaWindow,
) {
  let title = window.label;
  let subtitle = durationLabel(window.windowDurationSeconds);

  if (providerId === "codex" || window.windowId.startsWith("codex.")) {
    if (window.windowId.endsWith(".primary") || window.windowId === "primary") {
      title = "Giới hạn trong 5 giờ";
      subtitle = "Khung 5 giờ · Codex";
    } else if (
      window.windowId.endsWith(".secondary") ||
      window.windowId === "secondary"
    ) {
      title = "Giới hạn hằng tuần";
      subtitle = "Khung 7 ngày · Codex";
    }
  } else if (providerId === "antigravity") {
    if (window.windowId === "gemini-weekly") {
      title = "Giới hạn tuần (Gemini)";
      subtitle = "Weekly Limit Remaining · Gemini Models";
    } else if (window.windowId === "gemini-5h") {
      title = "Giới hạn 5 giờ (Gemini)";
      subtitle = "Five Hour Limit Remaining · Gemini Models";
    } else if (window.windowId === "3p-weekly") {
      title = "Giới hạn tuần (Claude & GPT)";
      subtitle = "Weekly Limit Remaining · Claude and GPT models";
    } else if (window.windowId === "3p-5h") {
      title = "Giới hạn 5 giờ (Claude & GPT)";
      subtitle = "Five Hour Limit Remaining · Claude and GPT models";
    }
  } else if (providerId === "claude") {
    if (window.windowId === "five_hour") {
      title = "Giới hạn trong 5 giờ";
      subtitle = "Khung 5 giờ · Claude Code";
    } else if (window.windowId === "seven_day") {
      title = "Giới hạn hằng tuần";
      subtitle = "Khung 7 ngày · Claude Code";
    }
  }

  return { title, subtitle };
}

export function WindowViewCard({
  providerId,
  window,
  availability,
  thresholdSeconds,
  generatedAt,
  sourceEnabled,
}: {
  providerId?: string;
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

  const rawRemaining =
    window.remainingPercent !== null && window.remainingPercent !== undefined
      ? window.remainingPercent
      : window.usedPercent !== null && window.usedPercent !== undefined
        ? 100 - window.usedPercent
        : null;
  const remaining = rawRemaining !== null ? Math.round(rawRemaining) : null;

  const rawUsed =
    window.usedPercent !== null && window.usedPercent !== undefined
      ? window.usedPercent
      : window.remainingPercent !== null &&
          window.remainingPercent !== undefined
        ? 100 - window.remainingPercent
        : null;
  const used =
    rawUsed !== null
      ? Number.isInteger(rawUsed)
        ? rawUsed
        : Math.round(rawUsed * 10) / 10
      : null;

  const isLowQuota = remaining !== null && remaining <= 20;
  const barColor = isLowQuota ? "bg-amber-500" : "bg-primary";

  const { title: displayTitle, subtitle: displaySubtitle } =
    formatWindowMetadata(providerId, window);

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
      className="gap-4 py-4 shadow-none border-border"
    >
      <CardHeader className="gap-1 px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold">
            {displayTitle}
          </CardTitle>
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
        <p className="text-xs text-muted-foreground">{displaySubtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {remaining === null ? "Chưa xác định" : `Còn lại ${remaining}%`}
            </span>
            {used !== null ? (
              <span className="text-xs text-muted-foreground font-medium tabular-nums">
                (Đã dùng{" "}
                <span className="font-semibold text-foreground/80">
                  {used}%
                </span>
                )
              </span>
            ) : null}
          </div>
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
            barAvailable && remaining !== null
              ? `Còn lại ${remaining}% (Đã dùng ${used}%)`
              : `${freshness}; phần trăm không khả dụng`
          }
          className="h-2.5 overflow-hidden rounded-full bg-muted"
        >
          {barAvailable && remaining !== null ? (
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${remaining}%` }}
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
        <dl className="grid gap-1.5 text-xs text-muted-foreground pt-1">
          {window.resetAt ? (
            <div className="flex justify-between gap-2 font-medium text-foreground">
              <dt>Thời gian đặt lại</dt>
              <dd className="font-semibold text-primary">
                {remainingLabel(
                  Math.floor((Date.parse(window.resetAt) - now) / 1000),
                )}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt>Mốc đặt lại (UTC)</dt>
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
        </dl>
      </CardContent>
    </Card>
  );
}
