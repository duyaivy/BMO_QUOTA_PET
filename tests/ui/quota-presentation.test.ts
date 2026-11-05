import { describe, expect, it } from "vitest";
import {
  absoluteTime,
  formatPercent,
  countdown,
  freshnessLabel,
  quotaTone,
  remainingPercent,
  usableQuota,
  windowTitle,
} from "@/components/quota/presentation";
import { fixtureWindow } from "../fixtures/usage";

const now = Date.parse("2026-11-06T10:00:00Z");
const capture = new Date(now - 1000).toISOString();
describe("quota presentation", () => {
  it("preserves source precision and uses remaining capacity for thresholds", () => {
    const window = fixtureWindow("gemini-5h", 8.7654, capture, {
      remainingPercent: 91.2346,
    });
    expect(remainingPercent(window)).toBe(91.2346);
    expect(remainingPercent({ ...window, remainingPercent: null })).toBe(
      91.2346,
    );
    expect(
      remainingPercent({
        ...window,
        remainingPercent: null,
        usedPercent: null,
      }),
    ).toBeNull();
    expect([50.01, 50, 20, 19.99, 0, null].map(quotaTone)).toEqual([
      "healthy",
      "warning",
      "warning",
      "critical",
      "critical",
      "unknown",
    ]);
  });
  it("rounds display values to at most two decimals without changing stored precision", () => {
    expect([91.2346, 8.7654, 100, 94.5, 0, 0.005].map(formatPercent)).toEqual([
      "91.23%",
      "8.77%",
      "100%",
      "94.5%",
      "0%",
      "0.01%",
    ]);
    const window = fixtureWindow("precision", 8.7654, capture, {
      remainingPercent: 91.2346,
    });
    expect(formatPercent(remainingPercent(window)!)).toBe("91.23%");
    expect(window.usedPercent).toBe(8.7654);
    expect(window.remainingPercent).toBe(91.2346);
  });
  it("does not use a recent capture or a future timestamp as proof of freshness", () => {
    const window = fixtureWindow("unknown", 10, capture, {
      upstreamObservedAt: null,
      sourceFreshness: "unknown",
      freshnessBasis: "session_snapshot",
    });
    expect(freshnessLabel(window, now, 900)).toBe("Chưa xác minh độ mới");
    expect(
      freshnessLabel(
        {
          ...window,
          upstreamObservedAt: new Date(now + 1000).toISOString(),
          sourceFreshness: "fresh",
          freshnessBasis: "upstream_timestamp",
        },
        now,
        900,
      ),
    ).toBe("Chưa xác minh độ mới");
    const fresh = fixtureWindow("known", 10, capture);
    expect(freshnessLabel(fresh, now, 900)).toBe("Dữ liệu mới");
    expect(freshnessLabel(fresh, now + 900001, 900)).toBe("Dữ liệu cũ");
    expect(
      freshnessLabel({ ...fresh, sourceFreshness: "unknown" }, now, 900),
    ).toBe("Chưa xác minh độ mới");
  });
  it("handles reset boundaries and invalid timestamps without inventing new quota", () => {
    expect(countdown(null, now)).toBe("Chưa có mốc đặt lại");
    expect(countdown("invalid", now)).toBe("Chưa có mốc đặt lại");
    expect(absoluteTime("invalid")).toBe("Chưa xác định");
    expect(countdown(new Date(now + 176400000).toISOString(), now)).toBe(
      "2 ngày 1 giờ",
    );
    expect(countdown(new Date(now + 3660000).toISOString(), now)).toBe(
      "1 giờ 1 phút",
    );
    const window = fixtureWindow("expiry", 12.25, capture, {
      resetAt: new Date(now).toISOString(),
    });
    expect(countdown(window.resetAt, now)).toBe("Đã quá thời gian đặt lại");
    expect(usableQuota({ window, availability: "ok" }, now, 900)).toBe(false);
    expect(remainingPercent(window)).toBe(87.75);
    expect(
      usableQuota(
        { window: { ...window, resetAt: null }, availability: "unavailable" },
        now,
        900,
      ),
    ).toBe(false);
  });
  it("preserves unrecognized dynamic windows instead of assigning a fixed duration", () => {
    const window = fixtureWindow("custom-window", 20, capture, {
      label: "Custom source window",
    });
    expect(windowTitle("antigravity", window)).toBe("Custom source window");
    expect(windowTitle("antigravity", { ...window, windowId: "3p-5h" })).toBe(
      "Giới hạn 5 giờ",
    );
  });
});
