import type { ReactNode } from "react";
import { CircleOff } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function UnavailableState({
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
      <CardContent className="flex items-start gap-4 px-5 py-5 sm:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <CircleOff aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
