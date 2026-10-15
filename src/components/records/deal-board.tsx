"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarDays, GripVertical, MoveRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { moveDealAction } from "@/app/(app)/deals/actions";
import { UserAvatar } from "@/components/badges";
import { Field, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { StageType } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { otherCurrenciesNote, totalInCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface BoardStage {
  id: string;
  name: string;
  type: StageType;
  probability: number;
}

export interface BoardDeal {
  id: string;
  title: string;
  amount: string;
  currency: string;
  stageId: string;
  companyName: string | null;
  contactName: string | null;
  ownerName: string | null;
  expectedClose: string | null;
}

interface PendingLoss {
  deal: BoardDeal;
  stage: BoardStage;
}

/**
 * Kanban board. Moves are applied optimistically, confirmed by the server (which re-checks
 * permissions and close rules) and rolled back with an error toast if the server refuses.
 */
export function DealBoard({
  stages,
  deals,
  currency,
  canWrite,
}: {
  stages: BoardStage[];
  deals: BoardDeal[];
  /** Workspace reporting currency; column totals only add deals in this currency. */
  currency: string;
  canWrite: boolean;
}) {
  const [optimisticDeals, applyMove] = useOptimistic(
    deals,
    (state, move: { dealId: string; stageId: string }) =>
      state.map((deal) => (deal.id === move.dealId ? { ...deal, stageId: move.stageId } : deal)),
  );
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingLoss, setPendingLoss] = useState<PendingLoss | null>(null);
  // A card moved from its "Move to" menu lands in another column as a new element; its menu
  // button there takes the focus back so keyboard users carry on from the card.
  const [refocusId, setRefocusId] = useState<string | null>(null);
  const clearRefocus = useCallback(() => setRefocusId(null), []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const activeDeal = optimisticDeals.find((deal) => deal.id === activeId) ?? null;

  function move(deal: BoardDeal, stage: BoardStage, lostReason?: string) {
    if (deal.stageId === stage.id) return;
    if (stage.type === "LOST" && !lostReason) {
      setPendingLoss({ deal, stage });
      return;
    }
    startTransition(async () => {
      applyMove({ dealId: deal.id, stageId: stage.id });
      const result = await moveDealAction(deal.id, stage.id, lostReason);
      if (result.ok) {
        toast.success(`"${deal.title}" moved to ${stage.name}`);
      } else {
        toast.error(`Could not move "${deal.title}": ${result.error}`);
      }
    });
  }

  function moveFromMenu(deal: BoardDeal, stage: BoardStage) {
    setRefocusId(deal.id);
    move(deal, stage);
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const deal = optimisticDeals.find((candidate) => candidate.id === event.active.id);
    const stage = stages.find((candidate) => candidate.id === event.over?.id);
    if (deal && stage) move(deal, stage);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          {stages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              deals={optimisticDeals.filter((deal) => deal.stageId === stage.id)}
              stages={stages}
              currency={currency}
              canWrite={canWrite}
              onMove={moveFromMenu}
              refocusId={refocusId}
              onRefocused={clearRefocus}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDeal ? <DealCard deal={activeDeal} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <LostReasonDialog
        pending={pendingLoss}
        onCancel={() => {
          setPendingLoss(null);
          setRefocusId(null);
        }}
        onConfirm={(reason) => {
          if (pendingLoss) move(pendingLoss.deal, pendingLoss.stage, reason);
          setPendingLoss(null);
        }}
      />
    </>
  );
}

function Column({
  stage,
  deals,
  stages,
  currency,
  canWrite,
  onMove,
  refocusId,
  onRefocused,
}: {
  stage: BoardStage;
  deals: BoardDeal[];
  stages: BoardStage[];
  currency: string;
  canWrite: boolean;
  onMove: (deal: BoardDeal, stage: BoardStage) => void;
  refocusId: string | null;
  onRefocused: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: !canWrite });
  const total = totalInCurrency(deals, currency);
  const note = otherCurrenciesNote(total.excluded);
  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.name} stage`}
      data-testid="board-column"
      data-stage-name={stage.name}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b px-3 py-2.5">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                stage.type === "WON"
                  ? "bg-emerald-500"
                  : stage.type === "LOST"
                    ? "bg-red-500"
                    : "bg-primary",
              )}
            />
            {stage.name}
            <span className="font-normal text-muted-foreground">{deals.length}</span>
          </h2>
          <p className="text-xs text-muted-foreground" data-testid="column-total">
            {formatMoney(total.amount, currency)}
            {stage.type === "OPEN" ? ` · ${stage.probability}%` : ""}
          </p>
          {note ? (
            <p className="text-xs text-muted-foreground" data-testid="column-other-currencies">
              {note}
            </p>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-32 flex-1 flex-col gap-2 p-2">
        {deals.map((deal) => (
          <DraggableDeal
            key={deal.id}
            deal={deal}
            stages={stages}
            canWrite={canWrite}
            onMove={onMove}
            refocus={deal.id === refocusId}
            onRefocused={onRefocused}
          />
        ))}
        {deals.length === 0 ? (
          <p className="m-auto py-6 text-xs text-muted-foreground">
            {canWrite ? "Drop deals here" : "No deals"}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DraggableDeal({
  deal,
  stages,
  canWrite,
  onMove,
  refocus,
  onRefocused,
}: {
  deal: BoardDeal;
  stages: BoardStage[];
  canWrite: boolean;
  onMove: (deal: BoardDeal, stage: BoardStage) => void;
  refocus: boolean;
  onRefocused: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    disabled: !canWrite,
  });
  const moveButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!refocus) return;
    // Runs after the closed menu (or lost-reason dialog) has tried to restore focus itself.
    const timer = setTimeout(() => {
      moveButton.current?.focus();
      onRefocused();
    });
    return () => clearTimeout(timer);
  }, [refocus, onRefocused]);
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <DealCard
        deal={deal}
        dragHandle={
          canWrite ? (
            <button
              type="button"
              className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
              aria-label={`Drag ${deal.title}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null
        }
        moveMenu={
          canWrite ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={moveButton}
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${deal.title} to another stage`}
                >
                  <MoveRight />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                {stages
                  .filter((stage) => stage.id !== deal.stageId)
                  .map((stage) => (
                    <DropdownMenuItem key={stage.id} onSelect={() => onMove(deal, stage)}>
                      {stage.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />
    </div>
  );
}

function DealCard({
  deal,
  overlay,
  dragHandle,
  moveMenu,
}: {
  deal: BoardDeal;
  overlay?: boolean;
  dragHandle?: React.ReactNode;
  moveMenu?: React.ReactNode;
}) {
  return (
    <article
      aria-label={deal.title}
      data-testid="deal-card"
      className={cn(
        "rounded-lg border bg-card p-3 text-sm shadow-xs",
        overlay && "rotate-1 shadow-lg ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start gap-1.5">
        {dragHandle}
        <div className="min-w-0 flex-1">
          <Link
            href={`/deals/${deal.id}`}
            className="line-clamp-2 font-medium hover:text-primary hover:underline"
          >
            {deal.title}
          </Link>
          {deal.companyName ? (
            <p className="truncate text-xs text-muted-foreground">{deal.companyName}</p>
          ) : null}
        </div>
        {moveMenu}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums">
          {formatMoney(deal.amount, deal.currency)}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {deal.expectedClose ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {deal.expectedClose}
            </span>
          ) : null}
          {deal.ownerName ? <UserAvatar name={deal.ownerName} /> : null}
        </span>
      </div>
    </article>
  );
}

function LostReasonDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingLoss | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Why was this deal lost?</DialogTitle>
          <DialogDescription>
            {pending ? `"${pending.deal.title}" will move to ${pending.stage.name}.` : null}
          </DialogDescription>
        </DialogHeader>
        <form
          method="post"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get("lostReason") ?? "").trim();
            if (!reason) {
              setError("Give a reason when marking a deal as lost.");
              return;
            }
            setError(null);
            onConfirm(reason);
          }}
        >
          <Field label="Reason" htmlFor="board-lost-reason" error={error ?? undefined}>
            <Textarea id="board-lost-reason" name="lostReason" rows={3} autoFocus />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <SubmitButton pending={false} variant="destructive">
              Mark as lost
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
