import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        <span className="mb-4 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <Inbox aria-hidden="true" className="size-5" />
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {children ? <div className="mt-5">{children}</div> : null}
      </CardContent>
    </Card>
  );
}
