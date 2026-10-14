"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <TriangleAlert className="size-6 text-destructive" />
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page could not be loaded. Try again, and if it keeps happening, share this reference
        with support: <code>{error.digest ?? "n/a"}</code>
      </p>
      <Button variant="outline" onClick={reset}>
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
