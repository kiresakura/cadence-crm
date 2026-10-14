"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

/** Delete button with a confirmation dialog; navigates to `redirectTo` afterwards. */
export function ConfirmDelete({
  action,
  title,
  description,
  redirectTo,
  successMessage = "Deleted",
  label = "Delete",
  iconLabel,
}: {
  action: () => Promise<ActionResult<unknown>>;
  title: string;
  description: string;
  redirectTo?: string;
  successMessage?: string;
  label?: string;
  /** Renders a compact icon button with this accessible name instead of a labelled one. */
  iconLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {iconLabel ? (
          <Button variant="ghost" size="icon-sm" aria-label={iconLabel} disabled={pending}>
            <Trash2 />
          </Button>
        ) : (
          <Button variant="destructive" disabled={pending}>
            <Trash2 /> {label}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                const result = await action();
                if (result.ok) {
                  toast.success(successMessage);
                  if (redirectTo) router.push(redirectTo);
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
