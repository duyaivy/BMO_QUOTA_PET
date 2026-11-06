import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { absoluteTime } from "@/components/quota/presentation";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Trạng thái vận hành | BMO Personal",
  description: "Độ khả dụng của các dịch vụ vận hành BMO.",
};
export default async function StatusPage() {
  const snapshot = await readDashboard();
  const items = [
    {
      name: "Cơ sở dữ liệu ứng dụng",
      status: "Khả dụng",
      detail:
        "Dữ liệu bảng điều khiển đã lưu được đọc thành công cho trang này.",
    },
    {
      name: "Thu nạp dữ liệu sử dụng",
      status: "Đã cấu hình",
      detail:
        "Đường dẫn thu nạp của ứng dụng đã được cấu hình. Điều này không xác minh việc truyền tải từ bên ngoài.",
    },
    {
      name: "Tích hợp nhà cung cấp",
      status: `${snapshot.providers.filter((provider) => provider.verification === "verified").length}/${snapshot.providers.length} đã xác minh`,
      detail:
        "Trạng thái xác minh theo cấu hình từng nhà cung cấp. Việc bật nguồn không xác nhận dữ liệu mới.",
    },
    {
      name: "MQTT broker",
      status: "Chưa kiểm tra",
      detail:
        "Trang này không kiểm tra kết nối MQTT broker. Xem thông số kết nối đã cấu hình tại Thiết bị.",
    },
    {
      name: "Phần cứng và triển khai",
      status: "Chưa xác minh",
      detail:
        "Không có bằng chứng kiểm tra phần cứng hay triển khai thực tế trong dữ liệu của trang này.",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Vận hành"
        title="Trạng thái dịch vụ"
        description={`Trạng thái ứng dụng cục bộ được đọc lúc ${absoluteTime(new Date(snapshot.generatedAt).toISOString())}. Không thực hiện truy vấn nhà cung cấp hay kiểm tra tình trạng broker.`}
      />
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
