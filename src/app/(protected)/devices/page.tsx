import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceEditor } from "@/components/device/device-editor";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Thiết bị | BMO Personal",
  description: "Cấu hình thứ tự màn hình hiển thị BMO.",
};

export default async function DevicesPage() {
  const snapshot = await readDashboard();
  return (
    <>
      <PageHeader
        eyebrow="Thiết bị"
        title="Màn hình hiển thị BMO"
        description="Sắp xếp cấu hình hiển thị cục bộ và xem trước theo kích thước màn hình OLED. Việc lưu cài đặt không xác nhận việc truyền tải qua broker hay khả năng kết nối phần cứng."
      />
      <Card className="mb-5 border-dashed shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Trạng thái kết nối màn hình</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Việc truyền dữ liệu qua MQTT broker, khả năng tiếp cận thiết bị và đầu ra màn hình
            vật lý chưa được triển khai hoặc xác minh.
          </p>
        </CardContent>
      </Card>
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
