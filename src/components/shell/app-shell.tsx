"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Bot,
  ChevronDown,
  Cpu,
  House,
  Layers3,
  LogIn,
  LogOut,
  Menu,
  Monitor,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const providers = [
  { id: "antigravity", name: "Antigravity" },
  { id: "codex", name: "Codex" },
  { id: "claude", name: "Claude Code" },
];
export function AppShell({
  children,
  authenticated = false,
}: {
  children: ReactNode;
  authenticated?: boolean;
}) {
  const pathname = usePathname(),
    router = useRouter();
  const [expanded, setExpanded] = useState(true),
    [drawerOpen, setDrawerOpen] = useState(false),
    [logoutError, setLogoutError] = useState("");
  const sidebar = useRef<HTMLElement>(null),
    menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuButton.current;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled])",
        ) ?? [],
      ).filter((element) => element.getClientRects().length);
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      trigger?.focus();
    };
  }, [drawerOpen]);
  async function signOut() {
    try {
      const { csrfToken } = (await (
        await fetch("/api/auth/csrf", { cache: "no-store" })
      ).json()) as { csrfToken: string };
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (response.ok) {
        router.replace("/login");
        router.refresh();
      } else setLogoutError("Đăng xuất thất bại. Vui lòng thử lại.");
    } catch {
      setLogoutError(
        "Tính năng đăng xuất tạm thời không khả dụng. Vui lòng thử lại.",
      );
    }
  }
  function navLink(href: string, label: string, Icon: typeof House) {
    const active = pathname === href && label !== "Cài đặt";
    return (
      <Link
        href={href}
        onClick={() => setDrawerOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
          active
            ? "bg-gradient-to-r from-[#5543b0]/65 to-[#303253]/80 text-white shadow-sm"
            : "text-[#bdc5dc] hover:bg-white/5 hover:text-white",
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn("size-5 shrink-0", active && "text-[#bca6ff]")}
        />
        {label}
      </Link>
    );
  }
  return (
    <div className="min-h-screen text-foreground">
      <a
        href="#main-content"
        className="sr-only z-[70] rounded-md bg-primary px-4 py-2 font-medium text-background focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Chuyển đến nội dung
      </a>
      <div
        inert={drawerOpen}
        className="flex h-18 items-center justify-between border-b border-border bg-[#0d1024] px-4 lg:hidden"
      >
        <div className="flex items-center gap-3">
          <Bot aria-hidden="true" className="size-7 text-primary" />
          <span className="font-semibold">BMO Quota</span>
        </div>
        <button
          ref={menuButton}
          type="button"
          aria-label="Mở menu điều hướng"
          aria-expanded={drawerOpen}
          aria-controls="dashboard-sidebar"
          onClick={() => setDrawerOpen(true)}
          className="grid size-11 place-items-center rounded-lg border border-border"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
      </div>
      {drawerOpen && (
        <div
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm lg:hidden"
        />
      )}
      <div className="flex min-h-screen">
        <aside
          id="dashboard-sidebar"
          ref={sidebar}
          role={drawerOpen ? "dialog" : undefined}
          aria-modal={drawerOpen ? true : undefined}
          aria-label={drawerOpen ? "Menu điều hướng" : undefined}
          className={cn(
            "z-50 w-[268px] shrink-0 flex-col border-r border-border/70 bg-gradient-to-b from-[#0d1024] to-[#0e1323] lg:sticky lg:top-0 lg:flex lg:h-screen",
            drawerOpen
              ? "fixed inset-y-0 left-0 flex h-dvh max-w-[85vw] shadow-2xl"
              : "hidden",
          )}
        >
          <div className="flex items-center gap-3 px-6 py-7">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-indigo-300/30 bg-gradient-to-br from-indigo-500 to-violet-800 shadow-lg shadow-violet-950/40">
              <Bot aria-hidden="true" className="size-7 text-cyan-100" />
            </span>
            <div>
              <p className="text-xl font-semibold tracking-tight">BMO Quota</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Theo dõi quota AI cá nhân
              </p>
            </div>
            <button
              type="button"
              aria-label="Đóng menu điều hướng"
              onClick={() => setDrawerOpen(false)}
              className="ml-auto grid min-h-11 min-w-8 place-items-center lg:hidden"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <nav
            aria-label="Điều hướng chính"
            className="flex-1 overflow-y-auto px-4 py-2"
          >
            <ul className="space-y-1.5">
              <li>{navLink("/", "Tổng quan", House)}</li>
              <li>
                <div className="flex items-center">
                  <div className="min-w-0 flex-1">
                    {navLink("/settings/providers", "Nhà cung cấp", Layers3)}
                  </div>
                  <button
                    type="button"
                    aria-label={
                      expanded ? "Thu gọn nhà cung cấp" : "Mở rộng nhà cung cấp"
                    }
                    aria-expanded={expanded}
                    aria-controls="provider-navigation"
                    onClick={() => setExpanded((value) => !value)}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/5"
                  >
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "size-4 transition-transform",
                        !expanded && "-rotate-90",
                      )}
                    />
                  </button>
                </div>
                {expanded && (
                  <ul
                    id="provider-navigation"
                    className="mt-1 ml-6 space-y-1 border-l border-border pl-3"
                  >
                    {providers.map((provider) => {
                      const active = pathname === `/providers/${provider.id}`;
                      return (
                        <li key={provider.id}>
                          <Link
                            href={`/providers/${provider.id}`}
                            onClick={() => setDrawerOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                              active
                                ? "bg-primary/15 font-medium text-[#d1c3ff]"
                                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                active
                                  ? "bg-emerald-400 shadow-[0_0_8px_#4ade8040]"
                                  : "bg-muted-foreground/40",
                              )}
                            />
                            {provider.name}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
              <li>{navLink("/collectors", "Bộ thu thập", Cpu)}</li>
              <li>{navLink("/devices", "Thiết bị", Monitor)}</li>
              <li>{navLink("/status", "Trạng thái", Activity)}</li>
              {authenticated && (
                <li>{navLink("/settings/providers", "Cài đặt", Settings2)}</li>
              )}
              <li>{navLink("/login", "Đăng nhập quản trị", LogIn)}</li>
            </ul>
          </nav>
          <div className="space-y-3 border-t border-border/50 px-6 py-5">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              {authenticated
                ? "Không gian riêng của chủ sở hữu"
                : "Truy cập bằng tài khoản chủ sở hữu"}
            </p>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Độ mới quota được xác định từ dữ liệu nguồn, độc lập với trạng
              thái collector.
            </p>
            {authenticated && (
              <button
                type="button"
                onClick={signOut}
                className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Đăng xuất
              </button>
            )}
            {logoutError && (
              <p role="alert" className="text-xs text-destructive">
                {logoutError}
              </p>
            )}
          </div>
        </aside>
        <div inert={drawerOpen} className="flex min-w-0 flex-1 flex-col">
          <main
            id="main-content"
            tabIndex={-1}
            className="w-full flex-1 px-4 py-6 outline-none sm:px-6 lg:px-7 lg:py-6 xl:px-8"
          >
            <div className="mx-auto w-full max-w-[1440px] space-y-5">
              {children}
            </div>
          </main>
          <footer className="px-6 py-5 text-center text-[11px] leading-5 text-muted-foreground">
            BMO Quota · Các giá trị chỉ hiển thị khi có dữ liệu quan sát được.
          </footer>
        </div>
      </div>
    </div>
  );
}
