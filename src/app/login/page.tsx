import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { LoginForm } from "@/components/auth/login-form";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Đăng nhập | BMO Personal",
  description: "Đăng nhập vào không gian làm việc BMO Personal.",
};

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md py-6 sm:py-12">
      <span className="mb-6 grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <ShieldCheck aria-hidden="true" className="size-7" />
      </span>
      <PageHeader
        eyebrow="Truy cập"
        title="Đăng nhập"
        description="Đăng nhập bằng mật khẩu chủ sở hữu được định cấu hình cho phiên bản BMO này."
      />
      <LoginForm />
      <p className="mt-5 text-xs leading-6 text-muted-foreground">
        Không gian riêng của chủ sở hữu. Thông tin đăng nhập nhà cung cấp được
        quản lý trong ứng dụng chính thức.
      </p>
    </div>
  );
}
