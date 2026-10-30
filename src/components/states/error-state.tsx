"use client";

import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ErrorState({
  title = "Something went wrong",
  description = "This information could not be loaded. Try again in a moment.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 px-5 py-5 sm:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="mt-4"
            >
              Try again
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
