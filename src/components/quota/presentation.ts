import type { ProviderId, WindowView } from "@/contracts/dashboard";
import { effectiveWindow, type QuotaWindow } from "@/contracts/usage";

// Presentation thresholds only; ingestion and provider contracts stay unchanged.
export const QUOTA_THRESHOLDS = {
  healthyAbove: 50,
  warningAtLeast: 20,
} as const;
export function formatPercent(value: number) {
  return `${Number(value.toFixed(2))}%`;
}
export function quotaTone(value: number | null) {
  return value === null
    ? "unknown"
    : value > QUOTA_THRESHOLDS.healthyAbove
      ? "healthy"
      : value >= QUOTA_THRESHOLDS.warningAtLeast
        ? "warning"
        : "critical";
}
export function validPercent(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}
export function remainingPercent(window: QuotaWindow): number | null {
  if (validPercent(window.remainingPercent)) return window.remainingPercent;
  return validPercent(window.usedPercent)
    ? Number((100 - window.usedPercent!).toPrecision(15))
    : null;
}
export function absoluteTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Chưa xác định";
  return new Date(value)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}
export function countdown(resetAt: string | null, now: number) {
  if (!resetAt || !Number.isFinite(Date.parse(resetAt)))
    return "Chưa có mốc đặt lại";
  const seconds = Math.ceil((Date.parse(resetAt) - now) / 1000);
  if (seconds <= 0) return "Đã quá thời gian đặt lại";
  const days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days} ngày ${hours} giờ`;
  if (hours) return `${hours} giờ ${minutes} phút`;
  if (minutes) return `${minutes} phút`;
  return `${seconds} giây`;
}
export function freshnessLabel(
  window: QuotaWindow,
  now: number,
  threshold: number,
) {
  const effective = effectiveWindow(window, now, threshold);
  if (effective.resetExpired || effective.effectiveFreshness === "stale")
    return "Dữ liệu cũ";
  if (
    window.freshnessBasis !== "upstream_timestamp" ||
    window.sourceFreshness !== "fresh" ||
    !window.upstreamObservedAt ||
    !Number.isFinite(Date.parse(window.upstreamObservedAt)) ||
    Date.parse(window.upstreamObservedAt) > now
  )
    return "Chưa xác minh độ mới";
  return "Dữ liệu mới";
}
export function usableQuota(view: WindowView, now: number, threshold: number) {
  return (
    view.availability === "ok" &&
    view.window.dataStatus === "ok" &&
    !effectiveWindow(view.window, now, threshold).resetExpired &&
    freshnessLabel(view.window, now, threshold) !== "Dữ liệu cũ" &&
    remainingPercent(view.window) !== null
  );
}
export const providerMeta = {
  antigravity: {
    name: "Antigravity",
    models: "Claude & GPT, Gemini",
    description:
      "Theo dõi hạn mức cá nhân Google Antigravity cho các mô hình Claude & GPT và Gemini.",
  },
  codex: {
    name: "Codex",
    models: "Codex",
    description:
      "Hạn mức được chia sẻ giữa Codex, Công việc, Tác nhân không gian làm việc và ChatGPT cho Excel.",
  },
  claude: {
    name: "Claude Code",
    models: "Claude",
    description:
      "Theo dõi hạn mức Claude Code từ các quan sát nguồn đã được ghi nhận.",
  },
} satisfies Record<
  ProviderId,
  { name: string; models: string; description: string }
>;
export function windowTitle(provider: string | undefined, window: QuotaWindow) {
  const id = window.windowId;
  if (provider === "antigravity") {
    if (["3p-5h", "gemini-5h"].includes(id)) return "Giới hạn 5 giờ";
    if (["3p-weekly", "gemini-weekly"].includes(id)) return "Giới hạn tuần";
  }
  if (provider === "codex") {
    if (id === "primary" || id.endsWith(".primary")) return "Giới hạn 5 giờ";
    if (id === "secondary" || id.endsWith(".secondary")) return "Giới hạn tuần";
  }
  if (provider === "claude") {
    if (id === "five_hour") return "Giới hạn 5 giờ";
    if (id === "seven_day") return "Giới hạn tuần";
  }
  return window.label;
}
export function windowDuration(
  provider: string | undefined,
  window: QuotaWindow,
) {
  const title = windowTitle(provider, window);
  if (title === "Giới hạn 5 giờ") return "5 giờ";
  if (title === "Giới hạn tuần") return "7 ngày";
  const seconds = window.windowDurationSeconds;
  return seconds === null
    ? "Khung nguồn"
    : seconds % 86400 === 0
      ? `${seconds / 86400} ngày`
      : seconds % 3600 === 0
        ? `${seconds / 3600} giờ`
        : `${seconds} giây`;
}
