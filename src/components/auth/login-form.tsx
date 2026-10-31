"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
            ? "Too many attempts. Try again later."
            : "Sign in failed. Check the password and try again.",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setMessage("Sign in is temporarily unavailable.");
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
          Owner password
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
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
