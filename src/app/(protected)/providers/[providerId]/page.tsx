import { notFound } from "next/navigation";
import Link from "next/link";
import { Clock3, Info } from "lucide-react";
import { readDashboard } from "@/server/quota/queries";
import { ProviderQuotaCard } from "@/components/quota/provider-card";
import { ProviderSummary } from "@/components/quota/provider-summary";
import { ProviderIcon } from "@/components/quota/provider-icon";
import { RefreshButton } from "@/components/quota/refresh-button";
import { Badge } from "@/components/ui/badge";
import { absoluteTime, providerMeta } from "@/components/quota/presentation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  return {
    title: `${providerId === "claude" ? "Claude Code" : providerId === "codex" ? "Codex" : "Antigravity"} | BMO Quota`,
  };
}
export default async function ProviderPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  if (!["antigravity", "codex", "claude"].includes(providerId)) notFound();
  const snapshot = await readDashboard();
  const provider = snapshot.providers.find(
    (provider) => provider.providerId === providerId,
  );
  if (!provider) notFound();
  const observations = provider.windows
    .filter(({ window }) => window.dataStatus === "ok")
    .map(({ window }) => Date.parse(window.collectedAt))
    .filter(Number.isFinite);
  const last = observations.length ? Math.max(...observations) : null;
  const collector = snapshot.collectors.find(
    (collector) => collector.collectorId === provider.collectorId,
  );
  return (
    <>
      <header className="space-y-4">
        <nav
          aria-label="Đường dẫn"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Link className="hover:text-foreground" href="/settings/providers">
            Nhà cung cấp
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground/85">{provider.name}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-3">
            <ProviderIcon provider={provider.providerId} />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {provider.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {providerMeta[provider.providerId].description}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-2">
              <Badge
                variant={
                  provider.verification === "verified" ? "secondary" : "outline"
                }
              >
                {provider.verification === "verified"
                  ? "Tích hợp đã xác minh"
                  : provider.verification === "unsupported"
                    ? "Tích hợp không hỗ trợ"
                    : "Tích hợp chưa xác minh"}
              </Badge>
              {provider.synthetic && (
                <div>
                  <Badge variant="secondary">Dữ liệu mẫu mô phỏng</Badge>
                </div>
              )}
            </div>
            <RefreshButton compact />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <p className="flex items-center gap-2">
            <Clock3 aria-hidden="true" className="size-4" />
            Quan sát thành công gần nhất:{" "}
            {last === null ? (
              "Chưa có dữ liệu"
            ) : (
              <time dateTime={new Date(last).toISOString()}>
                {absoluteTime(new Date(last).toISOString())}
              </time>
            )}
          </p>
          <p>
            Collector:{" "}
            {collector
              ? collector.active
                ? "Đã bật; xem báo cáo sức khỏe để kiểm tra hoạt động"
                : "Đã tắt"
              : "Chưa cấu hình"}{" "}
            <Link className="text-primary hover:underline" href="/collectors">
              Xem trạng thái
            </Link>
          </p>
        </div>
      </header>
      <ProviderSummary
        provider={provider}
        generatedAt={snapshot.generatedAt}
        threshold={snapshot.freshnessThresholdSeconds}
      />
      <ProviderQuotaCard
        provider={provider}
        generatedAt={snapshot.generatedAt}
        freshnessThresholdSeconds={snapshot.freshnessThresholdSeconds}
        detailed
      />
      <details className="rounded-xl border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
        <summary className="min-h-6 py-1">Chi tiết tích hợp</summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt>Loại nguồn</dt>
            <dd className="mt-1 text-foreground">
              {provider.sourceType ?? "Chưa cấu hình"}
            </dd>
          </div>
          <div>
            <dt>Collector có thẩm quyền</dt>
            <dd className="mt-1 text-foreground">
              {provider.collectorId ?? "Chưa cấu hình"}
            </dd>
          </div>
          {provider.verificationNote && (
            <div className="sm:col-span-2">
              <dt>Ghi chú xác minh</dt>
              <dd className="mt-1 leading-5 text-foreground">
                {provider.verificationNote}
              </dd>
            </div>
          )}
        </dl>
      </details>
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 text-xs leading-6 text-muted-foreground">
        <Info
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-primary"
        />
        <p>
          Quota hiển thị theo quan sát gần nhất. Làm mới chỉ đọc dữ liệu đã lưu,
          không truy vấn nhà cung cấp. Mốc đặt lại không xác nhận quota đã được
          làm mới.{" "}
          <Link
            href="/settings/providers"
            className="text-primary hover:underline"
          >
            Cài đặt nguồn
          </Link>
        </p>
      </div>
    </>
  );
}
