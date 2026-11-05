import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshButton } from "@/components/quota/refresh-button";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Bộ thu thập | BMO Personal",
  description: "Trạng thái đăng ký và quan sát của bộ thu thập cục bộ.",
};
function timestamp(value: number | null) {
  return value === null
    ? "Chưa xác định"
    : new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export default async function CollectorsPage() {
  const snapshot = await readDashboard();
  return (
    <>
      <PageHeader
        eyebrow="Thu thập dữ liệu"
        title="Bộ thu thập"
        description="Việc truyền tải dữ liệu tải lên và quan sát hạn mức là hai tín hiệu tách biệt. Cả hai đều không khẳng định có số liệu mới từ nhà cung cấp."
      >
        <RefreshButton />
      </PageHeader>
      {snapshot.collectors.length ? (
        <section
          className="grid gap-4 lg:grid-cols-2"
          aria-label="Các bộ thu thập đã đăng ký"
        >
          {snapshot.collectors.map((collector) => (
            <Card key={collector.collectorId}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{collector.name}</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant={collector.active ? "default" : "outline"}>
                      {collector.active ? "Đã đăng ký" : "Đã thu hồi"}
                    </Badge>
                    {collector.synthetic ? (
                      <Badge variant="secondary">Dữ liệu mẫu mô phỏng</Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">
                      Lần tải lên thành công gần nhất
                    </dt>
                    <dd className="mt-1">{timestamp(collector.lastSeenAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Sự kiện nguồn gần nhất
                    </dt>
                    <dd className="mt-1">
                      {timestamp(collector.lastSourceEventAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Quan sát gần nhất được ghi nhận
                    </dt>
                    <dd className="mt-1">
                      {timestamp(collector.lastObservationCaptureAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Khung hạn mức gần nhất được ghi nhận
                    </dt>
                    <dd className="mt-1">
                      {timestamp(collector.lastQuotaCaptureAt)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 space-y-4">
                  {collector.healthReports.length ? (
                    collector.healthReports.map((report) => (
                      <section
                        key={report.providerId}
                        className="rounded-lg border p-3"
                        aria-label={`Tình trạng sức khỏe bộ thu thập ${report.providerId}`}
                      >
                        <div className="flex flex-wrap justify-between gap-2 text-sm font-medium">
                          <span>
                            {report.providerId} ·{" "}
                            {report.sourceVersion ?? "Chưa rõ phiên bản"}
                          </span>
                          <Badge variant="outline">
                            {report.collectedAt > snapshot.generatedAt + 1000
                              ? "Đồng hồ mẫu sức khỏe không chắc chắn"
                              : snapshot.generatedAt - report.collectedAt >
                                  180000
                                ? "Báo cáo sức khỏe đã cũ"
                                : "Báo cáo sức khỏe gần đây"}
                          </Badge>
                        </div>
                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">
                              Thời điểm lấy mẫu sức khỏe
                            </dt>
                            <dd>{timestamp(report.collectedAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Dữ liệu đầu vào nguồn
                            </dt>
                            <dd>
                              {report.sourceAvailability} ·{" "}
                              {report.health.sourceCode}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Hàng đợi tải lên
                            </dt>
                            <dd>
                              {report.health.queuePending} đang chờ ·{" "}
                              {report.health.queueBytes} byte
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Sự kiện bị loại bỏ
                            </dt>
                            <dd>{report.health.dropped}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Vùng đệm callback
                            </dt>
                            <dd>
                              {report.health.callbackPending ?? "Chưa rõ"} đang
                              chờ · {report.health.callbackBytes ?? "Chưa rõ"}{" "}
                              byte ·{" "}
                              {report.health.callbackDropped ?? "Chưa rõ"} bị
                              loại bỏ
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Bộ tải lên
                            </dt>
                            <dd>{report.health.lastUploadCode}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Lần thử lại tiếp theo
                            </dt>
                            <dd>
                              {report.health.nextRetryAt ?? "Không có báo cáo"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              Nguồn đang tạm dừng
                            </dt>
                            <dd>
                              {report.health.pausedSources.join(", ") ||
                                "Không có báo cáo"}
                            </dd>
                          </div>
                        </dl>
                      </section>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Chưa nhận được báo cáo sức khỏe nào từ bộ thu thập.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <EmptyState
          title="Chưa có bộ thu thập nào được đăng ký"
          description="Chưa có bộ thu thập cục bộ nào được kết nối. Khả năng kết nối tải lên và việc ghi nhận hạn mức chưa xác định."
        />
      )}
      <section
        className="rounded-xl border bg-card p-5 sm:p-6"
        aria-labelledby="collector-boundary-title"
      >
        <h2 id="collector-boundary-title" className="font-semibold">
          Tải lên không đồng nghĩa với làm mới hạn mức
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Các mốc thời gian trên hiển thị thời điểm BMO nhận phản hồi gần nhất
          từ bộ thu thập và thời điểm quan sát được ghi nhận. Việc truyền dữ
          liệu không làm mới tuổi nguồn hạn mức. Báo cáo tình trạng được ghi
          nhận cục bộ và bản thân chúng có thể bị cũ sau khi truyền tải ngoại
          tuyến. Thư mục phiên có thể đọc được hoặc sự im lặng không chứng minh
          được rằng CLI đang chạy hay đã đóng.
        </p>
      </section>
      <Link
        className="text-sm font-medium underline underline-offset-4"
        href="/settings/providers"
      >
        Xem lại các nguồn nhà cung cấp
      </Link>
    </>
  );
}
