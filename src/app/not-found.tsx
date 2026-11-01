import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";

export default function NotFound() {
  return (
    <>
      <PageHeader
        title="Không tìm thấy trang"
        description="Trang này không thuộc không gian làm việc của bạn."
      />
      <Link href="/" className="font-medium underline underline-offset-4">
        Quay lại trang tổng quan
      </Link>
    </>
  );
}
