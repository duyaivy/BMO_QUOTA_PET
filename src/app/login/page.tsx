import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Đăng nhập | BMO Personal",
  description: "Đăng nhập vào không gian làm việc BMO Personal.",
};

export default function LoginPage() {
  return (
    <>
      <PageHeader
        eyebrow="Truy cập"
        title="Đăng nhập"
        description="Đăng nhập bằng mật khẩu chủ sở hữu được định cấu hình cho phiên bản BMO này."
      />
      <LoginForm />
    </>
  );
}
