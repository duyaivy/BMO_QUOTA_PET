import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  children?: ReactNode;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  children,
}: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-5 pb-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {children ? (
        <div className={cn("flex shrink-0 flex-wrap items-center gap-2")}>
          {children}
        </div>
      ) : null}
    </header>
  );
}
