import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page does not exist, or it belongs to a workspace you are not part of.
      </p>
      <Button asChild className="mt-2">
        <Link href="/dashboard">Back to the dashboard</Link>
      </Button>
    </div>
  );
}
