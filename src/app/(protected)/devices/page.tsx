import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceEditor } from "@/components/device/device-editor";
import { readDashboard } from "@/server/quota/queries";
import { getDeviceProvisioningInfo } from "@/server/devices/repository";

export const metadata: Metadata = {
  title: "Thiết bị | BMO Personal",
  description: "Cấu hình thứ tự màn hình hiển thị BMO và thông số kết nối MQTT.",
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
      <div className="grid gap-5 md:grid-cols-2 mb-5">
        <Card className="border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Thông số MQTT Broker & ACL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-semibold text-muted-foreground">Topic Cấu hình:</span>
              <code className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {provisioning.configTopic}
              </code>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Topic Snapshot:</span>
              <code className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {provisioning.snapshotTopic}
              </code>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Quyền đăng ký (Subscribe ACL):</span>
              <code className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {provisioning.subscribeAcl}
              </code>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Broker Host:</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {provisioning.brokerHost}:{provisioning.brokerPort}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Bảo mật thiết bị & Thông tin xác thực</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              {provisioning.instructions}
            </p>
            <p className="mt-2 text-xs">
              Các thay đổi cấu hình được lưu cục bộ và xếp hàng vào Transactional Outbox để đẩy tới broker kèm theo cờ Retained.
            </p>
          </CardContent>
        </Card>
      </div>

      <DeviceEditor
        initialDevice={snapshot.device}
        providers={snapshot.providers}
        generatedAt={snapshot.generatedAt}
        freshnessThresholdSeconds={snapshot.freshnessThresholdSeconds}
      />
      <Link
        className="mt-5 inline-block text-sm font-medium underline underline-offset-4"
        href="/status"
      >
        Xem trạng thái vận hành
      </Link>
    </>
  );
}
