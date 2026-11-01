import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { ProviderQuotaCard } from "@/components/quota/provider-card";
import { RefreshButton } from "@/components/quota/refresh-button";
import { readDashboard } from "@/server/quota/queries";

export const metadata: Metadata = {
  title: "Tổng quan | BMO Personal",
  description: "Các quan sát hạn mức đã lưu và trạng thái nguồn.",
};

export default async function OverviewPage() {
  const snapshot = await readDashboard();
  const hasObservations = snapshot.providers.some(
    (provider) => provider.windows.length > 0,
  );
  return (
    <>
      <PageHeader
        eyebrow="Tổng quan"
        title="Tổng quan hạn mức của bạn"
        description="Các giá trị hạn mức được lấy từ các quan sát cục bộ đã lưu. Làm mới trang này chỉ đọc dữ liệu ứng dụng; không kết nối tới dịch vụ nhà cung cấp."
      >
        <RefreshButton />
      </PageHeader>
      <section aria-label="Quan sát hạn mức nhà cung cấp" className="grid gap-4">
        {snapshot.providers.map((provider) => (
          <ProviderQuotaCard
            key={provider.providerId}
            provider={provider}
            generatedAt={snapshot.generatedAt}
            freshnessThresholdSeconds={snapshot.freshnessThresholdSeconds}
          />
        ))}
      </section>
      {!hasObservations ? (
        <EmptyState
          title="Chưa có quan sát hạn mức nào"
          description="Chưa có khung hạn mức nào được lưu. Thiếu dữ liệu nghĩa là chưa xác định; không có nghĩa là mức sử dụng bằng 0."
        />
      ) : null}
    </>
  );
}
