"use client";

import { useEffect, useState } from "react";
import { effectiveWindow, type QuotaWindow } from "@/contracts/usage";
import type { DataStatus } from "@/contracts/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function absoluteTime(value: string | null) {
  return value
    ? new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC")
    : "Unknown";
}
function remainingLabel(seconds: number) {
  if (seconds <= 0) return "Reset time passed";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days) return `${days}d ${hours}h until reset`;
  if (hours) return `${hours}h ${minutes}m until reset`;
  if (minutes) return `${minutes}m ${secs}s until reset`;
  return `${secs}s until reset`;
}
function durationLabel(seconds: number | null) {
  if (seconds === null) return "Duration unknown";
  if (seconds % 86400 === 0) return `${seconds / 86400} day window`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour window`;
  if (seconds % 60 === 0) return `${seconds / 60} minute window`;
  return `${seconds} second window`;
}
function availabilityLabel(status: DataStatus) {
  return {
    ok: "Available",
    unavailable: "Unavailable",
    unsupported: "Unsupported",
    error: "Source error",
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
    : "source disabled";
  const freshness = expired
    ? `Expired · last known${sourceAvailable ? "" : `; ${sourceState}`}`
    : !sourceAvailable
      ? `Last known · ${sourceState}`
      : stale
        ? "Stale · last known value"
        : effective.effectiveFreshness === "fresh"
          ? "Fresh by source timestamp"
          : "Source age unknown";
  const statusLabel = expired
    ? "Expired"
    : !sourceEnabled
      ? "Disabled"
      : !sourceAvailable
        ? availabilityLabel(availability)
        : stale
          ? "Stale"
          : effective.effectiveFreshness === "unknown"
            ? "Age unknown"
            : "Available";
  return (
    <Card
      role="group"
      aria-label={window.label + " quota window"}
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
            {used === null ? "Unknown" : `${used}%`}
          </span>
          <span className="text-right text-xs text-muted-foreground">
            {freshness}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${window.label} usage`}
          aria-valuemin={barAvailable && used !== null ? 0 : undefined}
          aria-valuemax={barAvailable && used !== null ? 100 : undefined}
          aria-valuenow={barAvailable && used !== null ? used : undefined}
          aria-valuetext={
            barAvailable && used !== null
              ? `${used}% used`
              : `${freshness}; percentage unavailable`
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
          Source freshness:{" "}
          {effective.effectiveFreshness === "unknown"
            ? "source age unknown"
            : effective.effectiveFreshness === "stale"
              ? "stale"
              : "fresh by source timestamp"}
        </p>
        <dl className="grid gap-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>Captured</dt>
            <dd>
              <time dateTime={window.collectedAt}>
                {absoluteTime(window.collectedAt)}
              </time>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Source observation</dt>
            <dd>
              {window.upstreamObservedAt ? (
                <time dateTime={window.upstreamObservedAt}>
                  {absoluteTime(window.upstreamObservedAt)}
                </time>
              ) : (
                "Unknown"
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Reset</dt>
            <dd>
              {window.resetAt ? (
                <time dateTime={window.resetAt}>
                  {absoluteTime(window.resetAt)}
                </time>
              ) : (
                "Unknown"
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
