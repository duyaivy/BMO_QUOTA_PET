import type { ProviderView } from "@/contracts/dashboard";
import { freshnessLabel, remainingPercent } from "./presentation";

export function providerStatus(
  provider: ProviderView,
  now: number,
  threshold: number,
) {
  let label: string;
  if (!provider.enabled) label = "Đang tắt";
  else if (
    provider.verification === "unsupported" ||
    provider.dataStatus === "unsupported" ||
    provider.sourceAvailability === "unsupported"
  )
    label = "Không hỗ trợ";
  else if (
    provider.dataStatus === "error" ||
    provider.sourceAvailability === "error"
  )
    label = "Lỗi nguồn";
  else if (provider.sourceAvailability === "inactive")
    label = "Nguồn không hoạt động";
  else if (
    provider.dataStatus === "unavailable" ||
    provider.sourceAvailability !== "available"
  )
    label = "Nguồn chưa khả dụng";
  else {
    const windows = provider.windows.filter(
      (view) =>
        view.availability === "ok" &&
        view.window.dataStatus === "ok" &&
        remainingPercent(view.window) !== null,
    );
    const labels = windows.map(({ window }) =>
      freshnessLabel(window, now, threshold),
    );
    label = !labels.length
      ? "Chưa có quota"
      : windows.length !== provider.windows.length || new Set(labels).size > 1
        ? "Dữ liệu một phần"
        : labels[0];
  }
  return { label, healthy: label === "Dữ liệu mới" };
}
