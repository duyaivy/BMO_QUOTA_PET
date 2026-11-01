import Link from "next/link";
import type { ProviderView } from "@/contracts/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WindowViewCard } from "@/components/quota/window-view";

export function ProviderQuotaCard({
  provider,
  generatedAt,
  freshnessThresholdSeconds,
}: {
  provider: ProviderView;
  generatedAt: number;
  freshnessThresholdSeconds: number;
}) {
  return (
    <Card role="region" aria-label={"Hạn mức " + provider.name}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle>{provider.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {provider.enabled ? "Nguồn đang bật" : "Nguồn đang tắt"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {provider.verification === "unverified"
                ? "Tích hợp chưa xác minh"
                : "Tích hợp " +
                  (provider.verification === "verified"
                    ? "đã xác minh"
                    : provider.verification === "unsupported"
                      ? "không hỗ trợ"
                      : provider.verification)}
            </Badge>
            {provider.synthetic ? (
              <Badge variant="secondary">Dữ liệu mẫu mô phỏng</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {provider.dataStatus !== "ok" ? (
          <p className="text-sm">
            {provider.dataStatus === "unsupported"
              ? "Không hỗ trợ"
              : provider.dataStatus === "error"
                ? "Lỗi nguồn"
                : "Hạn mức không khả dụng"}
          </p>
        ) : null}
        {provider.windows.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {provider.windows.map(({ window, availability }) => (
              <WindowViewCard
                key={`${window.windowId}:${window.collectedAt}`}
                window={window}
                availability={availability}
                thresholdSeconds={freshnessThresholdSeconds}
                generatedAt={generatedAt}
                sourceEnabled={provider.enabled}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Không có quan sát hạn mức nào khả dụng. Thiếu dữ liệu nghĩa là chưa xác định, không phải bằng 0.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Đăng nhập nhà cung cấp vẫn được duy trì trong ứng dụng chính thức.{" "}
          <Link
            className="underline underline-offset-4"
            href="/settings/providers"
          >
            Xem lại cài đặt nguồn
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
