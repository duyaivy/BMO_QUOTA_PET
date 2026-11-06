import { describe, expect, it } from "vitest";
import type { ProviderView } from "@/contracts/dashboard";
import { providerStatus } from "@/components/quota/provider-status";
import { fixtureWindow } from "../fixtures/usage";

const now = Date.parse("2026-11-07T10:00:00Z");
const captured = new Date(now - 1000).toISOString();
const base: ProviderView = {
  providerId: "codex",
  name: "Codex",
  enabled: true,
  verification: "unverified",
  verificationNote: null,
  sourceType: "codex-session-jsonl",
  ownershipGeneration: 2,
  collectorId: "native-collector",
  dataStatus: "ok",
  errorCode: null,
  sourceAvailability: "available",
  synthetic: false,
  windows: [
    { availability: "ok", window: fixtureWindow("primary", 47, captured) },
  ],
};

describe("provider operational status", () => {
  it("reports received quota independently of integration verification", () => {
    expect(providerStatus(base, now, 900).label).toBe("Dữ liệu mới");
    expect(providerStatus({ ...base, windows: [] }, now, 900).label).toBe(
      "Chưa có quota",
    );
    expect(
      providerStatus(
        { ...base, verification: "verified", windows: [] },
        now,
        900,
      ).label,
    ).toBe("Chưa có quota");
  });
  it.each([
    [{ enabled: false }, "Đang tắt"],
    [{ verification: "unsupported" }, "Không hỗ trợ"],
    [{ dataStatus: "unsupported" }, "Không hỗ trợ"],
    [{ sourceAvailability: "unsupported" }, "Không hỗ trợ"],
    [{ dataStatus: "error" }, "Lỗi nguồn"],
    [{ sourceAvailability: "error" }, "Lỗi nguồn"],
    [{ sourceAvailability: "inactive" }, "Nguồn không hoạt động"],
    [{ dataStatus: "unavailable" }, "Nguồn chưa khả dụng"],
    [{ sourceAvailability: "unavailable" }, "Nguồn chưa khả dụng"],
  ] as const)(
    "does not mask source state %j with old quota",
    (change, label) => {
      expect(providerStatus({ ...base, ...change }, now, 900).label).toBe(
        label,
      );
    },
  );
  it("handles stale, reset-expired, unknown-age and partial quota honestly", () => {
    expect(providerStatus(base, now + 901000, 900).label).toBe("Dữ liệu cũ");
    const unknown = {
      availability: "ok" as const,
      window: fixtureWindow("weekly", 23, captured, {
        upstreamObservedAt: null,
        freshnessBasis: "session_snapshot",
        sourceFreshness: "unknown",
      }),
    };
    expect(
      providerStatus({ ...base, windows: [unknown] }, now, 900).label,
    ).toBe("Chưa xác minh độ mới");
    expect(
      providerStatus({ ...base, windows: [...base.windows, unknown] }, now, 900)
        .label,
    ).toBe("Dữ liệu một phần");
    expect(
      providerStatus(
        {
          ...base,
          windows: [
            {
              ...base.windows[0],
              window: {
                ...base.windows[0].window,
                resetAt: new Date(now - 1).toISOString(),
              },
            },
          ],
        },
        now,
        900,
      ).label,
    ).toBe("Dữ liệu cũ");
    expect(
      providerStatus(
        {
          ...base,
          windows: [
            ...base.windows,
            { ...unknown, availability: "unavailable" },
          ],
        },
        now,
        900,
      ).label,
    ).toBe("Dữ liệu một phần");
    expect(
      providerStatus(
        {
          ...base,
          windows: [
            {
              availability: "ok",
              window: fixtureWindow("empty", null, captured),
            },
          ],
        },
        now,
        900,
      ).label,
    ).toBe("Chưa có quota");
  });
});
