import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { absoluteTime } from "@/components/quota/presentation";
import { readDashboard } from "@/server/quota/queries";
import { providerStatus } from "@/components/quota/provider-status";
import { ProviderIcon } from "@/components/quota/provider-icon";
import { RefreshButton } from "@/components/quota/refresh-button";
import { getRuntimeConfig } from "@/server/config";
import { checkMqttHealth } from "@/server/mqtt/health";

export const metadata: Metadata = {
  title: "Trạng thái vận hành | BMO Personal",
  description: "Độ khả dụng của các dịch vụ vận hành BMO.",
};
export default async function StatusPage() {
  const snapshot = await readDashboard();
  // readDashboard authenticates the owner before initiating a network probe.
  const broker = await checkMqttHealth();
  const origin = getRuntimeConfig().BMO_APP_ORIGIN;
  const uploads = snapshot.collectors.filter(
    (collector) => collector.lastSeenAt !== null,
  );
  const lastUpload = uploads.length
    ? Math.max(...uploads.map((collector) => collector.lastSeenAt!))
    : null;
  const items = [
    {
      name: "Cơ sở dữ liệu ứng dụng",
      status: "Khả dụng",
      detail:
        "Dữ liệu bảng điều khiển đã lưu được đọc thành công cho trang này.",
    },
    {
      name: "Thu nạp dữ liệu sử dụng",
      status: lastUpload === null ? "Chưa ghi nhận tải lên" : "Đã nhận dữ liệu",
      detail:
        lastUpload === null
          ? "Chưa có lần tải lên thành công được ghi nhận từ collector trong cơ sở dữ liệu này."
          : `Lần tải lên thành công gần nhất: ${absoluteTime(new Date(lastUpload).toISOString())}. ${uploads.filter((collector) => !collector.synthetic).length} collector nguồn thực và ${uploads.filter((collector) => collector.synthetic).length} collector mô phỏng đã từng tải lên. Tải lên thành công không xác nhận quota mới.`,
    },
    {
      name: "Tích hợp nhà cung cấp",
      status: `${snapshot.providers.filter((provider) => provider.verification === "verified").length}/${snapshot.providers.length} đã xác minh`,
      detail:
        "Trạng thái xác minh theo cấu hình từng nhà cung cấp. Việc bật nguồn không xác nhận dữ liệu mới.",
    },
    {
      name: "MQTT broker",
      status:
        broker.state === "connected"
          ? "Kết nối thành công"
          : broker.state === "unconfigured"
            ? "Chưa cấu hình"
            : "Kết nối thất bại",
      detail:
        broker.state === "unconfigured"
          ? "Chưa có MQTT_HOST trong môi trường ứng dụng."
          : `Kiểm tra lúc ${absoluteTime(new Date(broker.checkedAt).toISOString())} (${broker.durationMs} ms). ${broker.state === "connected" ? "Broker đã chấp nhận bắt tay MQTT bằng cấu hình hiện tại. Chưa xác minh quyền publish hoặc thiết bị nhận dữ liệu." : `Mã lỗi: ${broker.errorCode}. ${broker.errorCode === "CONNACK_REFUSED" ? "Broker từ chối kết nối; kiểm tra thông tin xác thực và quyền CONNECT." : broker.errorCode === "CONFIG_INVALID" ? "Kiểm tra cấu hình MQTT trong môi trường ứng dụng." : "Kiểm tra DNS, mạng, cổng và chứng chỉ TLS của broker."}`}`,
    },
    {
      name: "Môi trường ứng dụng",
      status:
        process.env.VERCEL === "1"
          ? "Vercel"
          : ["localhost", "127.0.0.1", "[::1]"].includes(
                new URL(origin).hostname,
              )
            ? "Cục bộ"
            : "Server riêng",
      detail: `Origin ứng dụng: ${origin}. Môi trường chạy không xác nhận kết nối collector, MQTT hoặc phần cứng.`,
    },
    {
      name: "Phần cứng BMO",
      status: "Chưa xác minh",
      detail:
        "Trang này chưa có tín hiệu xác nhận phần cứng đang kết nối. Cấu hình thiết bị hoặc bản xem trước không xác nhận thiết bị thật hoạt động.",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Vận hành"
        title="Trạng thái dịch vụ"
        description={`Dữ liệu đã lưu được đọc lúc ${absoluteTime(new Date(snapshot.generatedAt).toISOString())}. Broker được kiểm tra bằng bắt tay MQTT khi tải hoặc làm mới trang; không truy vấn trực tiếp nhà cung cấp.`}
      >
        <RefreshButton />
      </PageHeader>
      <section
        aria-label="Trạng thái từng nhà cung cấp"
        className="grid gap-4 xl:grid-cols-3"
      >
        {snapshot.providers.map((provider) => {
          const state = providerStatus(
            provider,
            snapshot.generatedAt,
            snapshot.freshnessThresholdSeconds,
          );
          const collector = snapshot.collectors.find(
            (item) => item.collectorId === provider.collectorId,
          );
          const captures = provider.windows
            .filter(({ window }) => window.dataStatus === "ok")
            .map(({ window }) => Date.parse(window.collectedAt))
            .filter(Number.isFinite);
          const lastCapture = captures.length ? Math.max(...captures) : null;
          const sourceNames: Record<string, string> = {
            "codex-session-jsonl": "Phiên Codex (JSONL)",
            "claude-statusline": "Statusline Claude Code",
            "antigravity-statusline": "Statusline Antigravity",
          };
          return (
            <Card
              key={provider.providerId}
              aria-label={`Trạng thái ${provider.name}`}
            >
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ProviderIcon provider={provider.providerId} />
                    <CardTitle>{provider.name}</CardTitle>
                  </div>
                  <Badge variant={state.healthy ? "secondary" : "outline"}>
                    {state.label}
                  </Badge>
                </div>
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
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      Nguồn dữ liệu đã ghi nhận
                    </dt>
                    <dd className="mt-1">
                      {provider.sourceType
                        ? (sourceNames[provider.sourceType] ??
                          provider.sourceType)
                        : "Chưa có nguồn đã ghi nhận"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Collector phụ trách
                    </dt>
                    <dd className="mt-1">
                      {collector
                        ? `${collector.name} · ${collector.active ? "Đã bật" : "Đã thu hồi"}`
                        : "Chưa đăng ký"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Lần tải lên thành công của collector
                    </dt>
                    <dd className="mt-1">
                      {collector?.lastSeenAt != null
                        ? absoluteTime(
                            new Date(collector.lastSeenAt).toISOString(),
                          )
                        : "Chưa ghi nhận"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Quan sát quota gần nhất
                    </dt>
                    <dd className="mt-1">
                      {lastCapture === null
                        ? "Chưa có quota"
                        : absoluteTime(new Date(lastCapture).toISOString())}
                    </dd>
                  </div>
                  {provider.errorCode && (
                    <div>
                      <dt className="text-muted-foreground">Mã lỗi nguồn</dt>
                      <dd className="mt-1">{provider.errorCode}</dd>
                    </div>
                  )}
                </dl>
                <Link
                  className="text-sm text-primary hover:underline"
                  href={`/providers/${provider.providerId}`}
                >
                  Xem quota {provider.name}
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </section>
      <section
        className="grid gap-4 md:grid-cols-2"
        aria-label="Trạng thái dịch vụ ứng dụng"
      >
        {items.map((item) => (
          <Card key={item.name}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>{item.name}</CardTitle>
                <Badge
                  variant={item.status === "Khả dụng" ? "secondary" : "outline"}
                >
                  {item.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
}
