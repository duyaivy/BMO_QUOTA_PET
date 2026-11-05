import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { getAdminSession } from "@/server/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "BMO Quota",
  description: "Theo dõi hạn mức AI cá nhân và trạng thái bộ thu thập.",
  icons: { icon: "/bmo-mark.svg" },
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let authenticated = false;
  try {
    authenticated = Boolean(await getAdminSession());
  } catch {}
  return (
    <html lang="vi">
      <body>
        <AppShell authenticated={authenticated}>{children}</AppShell>
      </body>
    </html>
  );
}
