"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error();
      const { csrfToken } = (await csrfResponse.json()) as {
        csrfToken: string;
      };
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, csrfToken }),
      });
      if (!response.ok) {
        setMessage(
          response.status === 429
            ? "Quá nhiều lần thử. Vui lòng thử lại sau."
            : "Đăng nhập thất bại. Vui lòng kiểm tra mật khẩu và thử lại.",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setMessage("Tính năng đăng nhập tạm thời không khả dụng.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-xl border bg-card p-5 sm:p-6"
    >
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Mật khẩu chủ sở hữu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="h-11 w-full rounded-lg">
        {busy ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
