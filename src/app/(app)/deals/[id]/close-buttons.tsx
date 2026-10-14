"use client";

import { ThumbsDown, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field, FormError, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { closeDealAction } from "../actions";

export function CloseDealButtons({
  dealId,
  status,
}: {
  dealId: string;
  status: "OPEN" | "WON" | "LOST";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close(outcome: "WON" | "LOST", reason?: string) {
    startTransition(async () => {
      const result = await closeDealAction(dealId, outcome, reason);
      if (result.ok) {
        toast.success(outcome === "WON" ? "Deal marked as won" : "Deal marked as lost");
        setOpen(false);
        router.refresh();
      } else {
        setError(result.fieldErrors?.lostReason?.[0] ?? result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      {status !== "WON" ? (
        <Button variant="outline" disabled={pending} onClick={() => close("WON")}>
          <Trophy /> Mark won
        </Button>
      ) : null}
      {status !== "LOST" ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={pending}>
              <ThumbsDown /> Mark lost
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mark deal as lost</DialogTitle>
              <DialogDescription>
                A short reason helps the team learn from lost deals.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                const reason = String(new FormData(event.currentTarget).get("lostReason") ?? "");
                close("LOST", reason);
              }}
            >
              <FormError message={error} />
              <Field label="Reason" htmlFor="lost-reason">
                <Textarea id="lost-reason" name="lostReason" rows={3} autoFocus />
              </Field>
              <DialogFooter>
                <SubmitButton pending={pending} variant="destructive">
                  Mark as lost
                </SubmitButton>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
