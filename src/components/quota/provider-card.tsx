import Link from "next/link";
import type { ProviderView, WindowView } from "@/contracts/dashboard";
import { Badge } from "@/components/ui/badge";
import { WindowViewCard } from "./window-view";
import { ProviderIcon } from "./provider-icon";
import { providerMeta } from "./presentation";
import { CalendarDays, Zap } from "lucide-react";
import { ObservationFreshness } from "./provider-summary";

export function ProviderQuotaCard({
  provider,
  generatedAt,
  freshnessThresholdSeconds,
  detailed = false,
}: {
  provider: ProviderView;
  generatedAt: number;
  freshnessThresholdSeconds: number;
  detailed?: boolean;
}) {
  const groups: Array<{
    id: string;
    title: string;
    description: string;
    windows: WindowView[];
  }> =
    provider.providerId === "antigravity"
      ? [
          {
            id: "third-party",
            title: "Claude & GPT",
            description:
              "Hạn mức cho các mô hình Claude & GPT trong Antigravity",
            windows: provider.windows
              .filter(({ window }) =>
                ["3p-5h", "3p-weekly"].includes(window.windowId),
              )
              .sort(
                (a, b) =>
                  Number(a.window.windowId.endsWith("weekly")) -
                  Number(b.window.windowId.endsWith("weekly")),
              ),
          },
          {
            id: "gemini",
            title: "Gemini",
            description: "Hạn mức cho các mô hình Gemini trong Antigravity",
            windows: provider.windows
              .filter(({ window }) =>
                ["gemini-5h", "gemini-weekly"].includes(window.windowId),
              )
              .sort(
                (a, b) =>
                  Number(a.window.windowId.endsWith("weekly")) -
                  Number(b.window.windowId.endsWith("weekly")),
              ),
          },
          {
            id: "other",
            title: "Các khung hạn mức khác",
            description:
              "Các khung khác được nguồn cung cấp; giữ nguyên nhãn và thời hạn.",
            windows: provider.windows.filter(
              ({ window }) =>
                !["3p-5h", "3p-weekly", "gemini-5h", "gemini-weekly"].includes(
                  window.windowId,
                ),
            ),
          },
        ].filter((group) => group.id !== "other" || group.windows.length)
      : [
          {
            id: provider.providerId,
            title: provider.name,
            description: providerMeta[provider.providerId].description,
            windows: provider.windows,
          },
        ];

  function slots(group: (typeof groups)[number]) {
    const ids =
      group.id === "third-party"
        ? ["3p-5h", "3p-weekly"]
        : group.id === "gemini"
          ? ["gemini-5h", "gemini-weekly"]
          : null;
    return ids
      ? ids.map((id) => ({
          id,
          view: group.windows.find((view) => view.window.windowId === id),
        }))
      : group.windows.map((view) => ({ id: view.window.windowId, view }));
  }
  return (
    <section
      role="region"
      aria-label={`Hạn mức ${provider.name}`}
      className="space-y-4"
    >
      {!detailed && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3">
          <Link
            href={`/providers/${provider.providerId}`}
            className="flex items-center gap-3 font-semibold hover:text-primary"
          >
            <ProviderIcon provider={provider.providerId} className="size-10" />
            {provider.name}
          </Link>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {provider.verification === "verified"
                ? "Tích hợp đã xác minh"
                : provider.verification === "unsupported"
                  ? "Tích hợp không hỗ trợ"
                  : "Tích hợp chưa xác minh"}
            </Badge>
            {provider.synthetic && (
              <Badge variant="secondary">Dữ liệu mẫu mô phỏng</Badge>
            )}
          </div>
        </div>
      )}
      {provider.dataStatus !== "ok" && (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {provider.dataStatus === "unsupported"
            ? "Không hỗ trợ"
            : provider.dataStatus === "error"
              ? "Lỗi nguồn"
              : "Hạn mức không khả dụng"}
          {!provider.enabled && " · Nguồn đang tắt"}
        </p>
      )}
      {groups.map((group) => (
        <section
          key={group.id}
          aria-label={`Nhóm ${group.title}`}
          className="rounded-[22px] border border-primary/15 bg-gradient-to-br from-[#191c34]/90 via-card/60 to-cyan-300/[0.02] p-4 shadow-sm sm:p-5"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ProviderIcon
                provider={
                  group.id === "gemini"
                    ? "gemini"
                    : provider.providerId === "antigravity"
                      ? "third-party"
                      : provider.providerId
                }
              />
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {group.title}
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
                  {group.description}
                </p>
              </div>
            </div>
            {detailed && (
              <ObservationFreshness
                windows={group.windows}
                generatedAt={generatedAt}
                threshold={freshnessThresholdSeconds}
              />
            )}
          </div>
          {slots(group).length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {slots(group).map(({ id, view }) =>
                view ? (
                  <WindowViewCard
                    key={`${id}:${view.window.collectedAt}`}
                    providerId={provider.providerId}
                    window={view.window}
                    availability={view.availability}
                    thresholdSeconds={freshnessThresholdSeconds}
                    generatedAt={generatedAt}
                    sourceEnabled={provider.enabled}
                    verification={provider.verification}
                    showFreshness={!detailed}
                  />
                ) : (
                  <div
                    key={id}
                    className="min-w-0 rounded-[18px] border border-dashed border-border bg-background/25 p-5"
                  >
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      {id.endsWith("5h") ? (
                        <Zap
                          aria-hidden="true"
                          className="size-5 text-cyan-300"
                        />
                      ) : (
                        <CalendarDays
                          aria-hidden="true"
                          className="size-5 text-primary"
                        />
                      )}
                      {id.endsWith("5h") ? "Giới hạn 5 giờ" : "Giới hạn tuần"}
                    </h3>
                    <p className="mt-5 text-lg font-semibold text-muted-foreground">
                      Chưa có dữ liệu
                    </p>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Chưa nhận được quan sát hạn mức cho khung này.
                    </p>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-background/25 px-5 py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Chưa có dữ liệu
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Chưa nhận được quan sát hạn mức cho nhóm này.
              </p>
            </div>
          )}
        </section>
      ))}
      {!detailed && (
        <Link
          className="inline-block px-1 text-xs text-primary underline-offset-4 hover:underline"
          href={`/providers/${provider.providerId}`}
        >
          Xem chi tiết {provider.name} →
        </Link>
      )}
    </section>
  );
}
