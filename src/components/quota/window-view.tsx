"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CalendarDays, Clock3, Zap } from "lucide-react";
import { effectiveWindow, type QuotaWindow } from "@/contracts/usage";
import type { DataStatus, ProviderView } from "@/contracts/dashboard";
import {
  absoluteTime,
  countdown,
  freshnessLabel,
  formatPercent,
  quotaTone,
  remainingPercent,
  validPercent,
  windowDuration,
  windowTitle,
} from "./presentation";

export function WindowViewCard({
  providerId,
  window,
  availability,
  thresholdSeconds,
  generatedAt,
  sourceEnabled,
  verification,
  showFreshness = true,
}: {
  providerId?: string;
  window: QuotaWindow;
  availability: DataStatus;
  thresholdSeconds: number;
  generatedAt: number;
  sourceEnabled: boolean;
  verification?: ProviderView["verification"];
  showFreshness?: boolean;
}) {
  const [now, setNow] = useState(generatedAt);
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(timer);
  }, []);
  const effective = effectiveWindow(window, now, thresholdSeconds);
  const freshness = freshnessLabel(window, now, thresholdSeconds);
  const available =
    sourceEnabled && availability === "ok" && window.dataStatus === "ok";
  const remaining = remainingPercent(window);
  const barAvailable =
    available &&
    !effective.resetExpired &&
    freshness !== "Dữ liệu cũ" &&
    remaining !== null;
  const tone = quotaTone(remaining);
  const historical = !available || freshness === "Dữ liệu cũ";
  const color =
    tone === "healthy"
      ? "bg-[#4ade80]"
      : tone === "warning"
        ? "bg-[#fbbf24]"
        : "bg-[#fb7185]";
  const status = !sourceEnabled
    ? "Nguồn đang tắt"
    : !available
      ? availability === "unsupported"
        ? "Không hỗ trợ"
        : "Không khả dụng"
      : freshness;
  return (
    <section
      role="group"
      aria-label={`Khung hạn mức ${window.label}`}
      className="min-w-0 rounded-[18px] border border-border bg-gradient-to-br from-[#1a2035] to-[#111728] p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold sm:text-base">
          {windowDuration(providerId, window) === "7 ngày" ? (
            <CalendarDays
              aria-hidden="true"
              className="size-5 shrink-0 text-primary"
            />
          ) : (
            <Zap aria-hidden="true" className="size-5 shrink-0 text-cyan-300" />
          )}
          {windowTitle(providerId, window)}
        </h3>
        <span className="shrink-0 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-0.5 text-xs text-[#c0b5ff]">
          {windowDuration(providerId, window)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
        <strong className="text-[32px] leading-none font-semibold tracking-tight">
          {remaining === null ? (
            <span className="text-lg text-muted-foreground">
              Chưa có dữ liệu
            </span>
          ) : (
            formatPercent(remaining)
          )}
        </strong>
        {remaining !== null && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${historical ? "bg-muted text-muted-foreground" : tone === "healthy" ? "bg-emerald-400/10 text-emerald-300" : tone === "warning" ? "bg-amber-400/10 text-amber-300" : "bg-rose-400/10 text-rose-300"}`}
          >
            {historical ? "Gần nhất" : "Còn lại"} {formatPercent(remaining)}
          </span>
        )}
        {validPercent(window.usedPercent) && (
          <span className="ml-auto text-xs text-muted-foreground">
            Đã dùng <span>{formatPercent(window.usedPercent!)}</span>
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={`Hạn mức còn lại ${window.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={barAvailable ? remaining : undefined}
        aria-valuetext={
          barAvailable
            ? `Còn lại ${formatPercent(remaining!)}`
            : `${status}; giá trị gần nhất, phần trăm hiện tại chưa xác định`
        }
        data-tone={barAvailable ? tone : "unknown"}
        className="mt-3 h-3 overflow-hidden rounded-full bg-[#252d47]"
      >
        {barAvailable && (
          <div
            className={`h-full rounded-full ${color} transition-[width] duration-500`}
            style={{ width: `${remaining}%` }}
          />
        )}
      </div>
      {showFreshness && (
        <p className="mt-3 text-xs text-muted-foreground">{status}</p>
      )}
      {effective.resetExpired && (
        <p className="mt-3 text-xs text-amber-300">
          Chờ quan sát mới sau mốc đặt lại. Giá trị gần nhất được giữ nguyên.
        </p>
      )}
      <div className="mt-4 flex items-start justify-between gap-3 text-xs sm:text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
          Đặt lại sau
        </span>
        <span
          className={
            barAvailable
              ? "text-right font-medium text-emerald-300"
              : "text-right text-muted-foreground"
          }
        >
          {countdown(window.resetAt, now)}
        </span>
      </div>
      <details className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <summary className="w-fit py-1 transition-colors hover:text-foreground">
          Chi tiết dữ liệu
        </summary>
        <dl className="mt-3 space-y-2 leading-5 [&>div]:flex [&>div]:flex-wrap [&>div]:justify-between [&>div]:gap-x-3 [&_dd]:text-foreground/85">
          <div>
            <dt>Khung dữ liệu nguồn</dt>
            <dd>{window.windowId}</dd>
          </div>
          <div>
            <dt>Mốc đặt lại (UTC)</dt>
            <dd>
              {window.resetAt && Number.isFinite(Date.parse(window.resetAt)) ? (
                <time dateTime={window.resetAt}>
                  {absoluteTime(window.resetAt)}
                </time>
              ) : (
                "Chưa xác định"
              )}
            </dd>
          </div>
          <div>
            <dt>Thời điểm ghi nhận (collector)</dt>
            <dd>
              <time dateTime={window.collectedAt}>
                {absoluteTime(window.collectedAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Thời điểm nguồn quan sát (UTC)</dt>
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
          <div>
            <dt>Độ mới dữ liệu nguồn</dt>
            <dd>Đánh giá: {freshness}</dd>
          </div>
          <div>
            <dt>Cơ sở đánh giá</dt>
            <dd>{window.freshnessBasis}</dd>
          </div>
          {verification && (
            <div>
              <dt>Xác minh tích hợp</dt>
              <dd>
                {verification === "verified"
                  ? "Đã xác minh"
                  : verification === "unsupported"
                    ? "Không hỗ trợ"
                    : "Chưa xác minh"}
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-3 flex gap-2 leading-5">
          <Clock3 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Thời điểm ghi nhận là mốc của collector, không xác nhận nguồn quota
          vừa được cập nhật.
        </p>
      </details>
    </section>
  );
}
