import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceEditor } from "@/components/device/device-editor";
import { readDashboard } from "@/server/quota/queries";
import { getDeviceProvisioningInfo } from "@/server/devices/repository";

export const metadata: Metadata = {
  title: "Thiết bị | BMO Personal",
  description:
    "Cấu hình thứ tự màn hình hiển thị BMO và thông số kết nối MQTT.",
};

export default async function DevicesPage() {
  const snapshot = await readDashboard();
  const provisioning = getDeviceProvisioningInfo(snapshot.device.deviceId);

  return (
    <>
      <PageHeader
        eyebrow="Thiết bị"
        title="Màn hình hiển thị BMO"
        description="Sắp xếp cấu hình hiển thị cục bộ, xem trước theo kích thước màn hình OLED 128×64, và xem thông số phân quyền MQTT broker."
      />

      <DeviceEditor
        initialDevice={snapshot.device}
        providers={snapshot.providers}
        generatedAt={snapshot.generatedAt}
        freshnessThresholdSeconds={snapshot.freshnessThresholdSeconds}
      />
      <details className="rounded-xl border border-border bg-card px-5 py-4">
        <summary className="min-h-7 text-sm font-semibold">
          Kết nối và bảo mật thiết bị
        </summary>
        <div className="mt-4 grid gap-5 xl:grid-cols-2">
          <Card className="border shadow-none">
            <CardHeader>
              <CardTitle className="text-base">
                Thông số MQTT Broker & ACL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="font-semibold text-muted-foreground">
                  Topic Cấu hình:
                </span>
                <code className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {provisioning.configTopic}
                </code>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">
                  Topic Snapshot:
                </span>
                <code className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {provisioning.snapshotTopic}
                </code>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">
                  Quyền đăng ký (Subscribe ACL):
                </span>
                <code className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {provisioning.subscribeAcl}
                </code>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">
                  Broker Host:
                </span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {provisioning.brokerHost}:{provisioning.brokerPort}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-none">
            <CardHeader>
              <CardTitle className="text-base">
                Bảo mật thiết bị & Thông tin xác thực
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>{provisioning.instructions}</p>
              <p className="mt-2 text-xs">
                Các thay đổi cấu hình được lưu và xếp hàng để gửi tới thiết bị
                khi kết nối khả dụng.
              </p>
            </CardContent>
          </Card>
        </div>
      </details>
      <Link
        className="mt-5 inline-block text-sm font-medium underline underline-offset-4"
        href="/status"
      >
        Xem trạng thái vận hành
      </Link>
    </>
  );
}
