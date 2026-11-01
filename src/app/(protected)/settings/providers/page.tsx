import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProviderToggle } from "@/components/settings/provider-toggle";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Cài đặt nhà cung cấp | BMO Personal",
  description: "Trạng thái xác minh và thiết lập nguồn nhà cung cấp.",
};
const guidance: Record<string, string> = {
  codex:
    "Hạn mức phiên chỉ đọc đã được xác minh cục bộ với Codex 0.163.0. Việc xác minh nguồn của bạn được quản lý riêng; thời gian bản ghi phiên không chứng minh được dữ liệu mới từ nhà cung cấp.",
  claude:
    "Dữ liệu thanh trạng thái gốc của Claude Code là một phương án dự kiến. Tính năng hỗ trợ đã cài đặt và thời điểm hạn mức vẫn chưa được xác minh.",
  antigravity:
    "Dữ liệu thanh trạng thái gốc của Antigravity là một phương án dự kiến. Tính năng hỗ trợ đã cài đặt và thời điểm hạn mức vẫn chưa được xác minh.",
};

export default async function ProviderSettingsPage() {
  const snapshot = await readDashboard();
  return (
    <>
      <PageHeader
        eyebrow="Cài đặt"
        title="Nguồn nhà cung cấp"
        description="BMO không đăng nhập vào tài khoản nhà cung cấp hay xử lý thông tin đăng nhập của họ. Việc đăng nhập được thực hiện độc lập trên ứng dụng chính thức của từng bên."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {snapshot.providers.map((provider) => (
          <Card
            key={provider.providerId}
            role="region"
            aria-label={"Cài đặt nguồn " + provider.name}
          >
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{provider.name}</CardTitle>
                <Badge variant="outline">
                  {provider.verification === "unverified"
                    ? "Tích hợp chưa xác minh"
                    : provider.verification === "verified"
                      ? "Đã xác minh"
                      : provider.verification}
                </Badge>
              </div>
              <CardDescription>{guidance[provider.providerId]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {provider.synthetic ? (
                <Badge variant="secondary">Dữ liệu mẫu mô phỏng</Badge>
              ) : null}
              <dl className="grid gap-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">Loại nguồn</dt>
                  <dd>{provider.sourceType ?? "Chưa cấu hình"}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">
                    Thế hệ sở hữu
                  </dt>
                  <dd>{provider.ownershipGeneration}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">
                    Bộ thu thập có thẩm quyền
                  </dt>
                  <dd>{provider.collectorId ?? "Không có"}</dd>
                </div>
              </dl>
              <ProviderToggle
                provider={provider}
                expectedRevision={snapshot.settingsRevision}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Hãy sử dụng hướng dẫn thiết lập bộ thu thập cục bộ cho các nguồn thực tế và mẫu;
        tuyệt đối không nhập thông tin đăng nhập của nhà cung cấp vào đây.
      </p>
      <Link
        className="text-sm font-medium underline underline-offset-4"
        href="/collectors"
      >
        Xem trạng thái bộ thu thập
      </Link>
    </>
  );
}
