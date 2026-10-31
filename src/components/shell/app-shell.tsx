"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, CircleGauge, LogOut } from "lucide-react";

import { navigationItems } from "@/contracts/navigation";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState("");

  async function signOut() {
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const { csrfToken } = (await csrfResponse.json()) as {
        csrfToken: string;
      };
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (response.ok) {
        router.replace("/login");
        router.refresh();
      } else setLogoutError("Sign out failed. Please retry.");
    } catch {
      setLogoutError("Sign out is temporarily unavailable. Please retry.");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-border bg-card lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3 px-5 py-4 lg:px-6 lg:py-7">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <CircleGauge aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="font-semibold tracking-tight">BMO Quota</p>
              <p className="text-xs text-muted-foreground">
                Personal workspace
              </p>
            </div>
          </div>
          <nav
            aria-label="Main navigation"
            className="px-3 pb-3 lg:px-4 lg:py-2"
          >
            <p className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:block">
              Workspace
            </p>
            <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {navigationItems.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(`${item.href}/`));
                return (
                  <li key={item.href} className="shrink-0 lg:shrink">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={item.description}
                      className={cn(
                        "block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="hidden px-6 lg:absolute lg:inset-x-0 lg:bottom-5 lg:block">
            <p className="text-xs leading-5 text-muted-foreground">
              Quota freshness depends on the last observed source data.
            </p>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-center text-xs font-medium text-foreground"
          >
            Private owner workspace · Provider sources remain unverified
            <ArrowUpRight
              aria-hidden="true"
              className="hidden size-3.5 sm:block"
            />
          </div>
          <main
            id="main-content"
            tabIndex={-1}
            className="w-full flex-1 px-4 py-7 outline-none sm:px-7 sm:py-9 lg:px-10 lg:py-10"
          >
            <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
          </main>
          {logoutError ? (
            <p role="alert" className="px-4 text-sm text-destructive">
              {logoutError}
            </p>
          ) : null}
          <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground sm:px-7 lg:px-10">
            Values are shown only when supported by observed data.
            <button
              onClick={signOut}
              className="ml-3 inline-flex items-center gap-1 underline underline-offset-2"
              type="button"
            >
              <LogOut aria-hidden="true" className="size-3" /> Sign out
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
