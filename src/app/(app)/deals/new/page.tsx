import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page";
import { DealForm } from "@/components/records/deal-form";
import { db } from "@/server/db";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";

import { loadDealFormData } from "../form-data";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage({ searchParams }: PageProps<"/deals/new">) {
  const { ctx, workspace } = await requirePageContext();
  if (!can(ctx.role, "records:write")) redirect("/deals");
  const params = await searchParams;
  const data = await loadDealFormData(ctx);
  const pipeline = data.pipelines[0];
  const pick = (key: string, options: Array<{ id: string }>) => {
    const value = params[key];
    return typeof value === "string" && options.some((option) => option.id === value)
      ? value
      : null;
  };
  // Pre-fill the company from the chosen contact when only the contact was given.
  const contactId = pick("contactId", data.contacts);
  const companyId =
    pick("companyId", data.companies) ??
    (contactId
      ? ((
          await db.contact.findFirst({
            where: { id: contactId, workspaceId: ctx.workspaceId },
            select: { companyId: true },
          })
        )?.companyId ?? null)
      : null);

  return (
    <>
      <PageHeader title="New deal" backHref="/deals" backLabel="Deals" />
      <DealForm
        {...data}
        values={{
          title: "",
          amount: "",
          currency: workspace.currency,
          pipelineId: pipeline?.id ?? "",
          stageId: pipeline?.stages[0]?.id ?? "",
          companyId,
          primaryContactId: contactId,
          ownerId: ctx.userId,
          expectedCloseDate: null,
          lostReason: null,
          customFields: {},
        }}
      />
    </>
  );
}
