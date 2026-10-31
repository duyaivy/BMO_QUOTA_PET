import { redirect } from "next/navigation";
import { getAdminSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let authenticated: boolean;
  try {
    authenticated = Boolean(await getAdminSession());
  } catch {
    authenticated = false;
  }
  if (!authenticated) redirect("/login");
  return children;
}
