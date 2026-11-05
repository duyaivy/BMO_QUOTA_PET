import { Bot, Code2, Orbit, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProviderIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const Icon =
    provider === "antigravity" || provider === "gemini"
      ? Sparkles
      : provider === "claude"
        ? Orbit
        : provider === "codex"
          ? Code2
          : Bot;
  return (
    <span
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-full border border-primary/15 bg-gradient-to-br from-primary/20 to-cyan-300/5 text-primary",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-6" />
    </span>
  );
}
