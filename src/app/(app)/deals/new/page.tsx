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
  const requested = (key: string) => (typeof params[key] === "string" ? params[key] : null);
  // Pre-fill the company from the chosen contact when only the contact was given.
  const contact = requested("contactId")
    ? await db.contact.findFirst({
        where: { id: requested("contactId") as string, workspaceId: ctx.workspaceId },
        select: { id: true, companyId: true },
      })
    : null;
  const data = await loadDealFormData(ctx, {
    companyId: requested("companyId") ?? contact?.companyId ?? null,
    primaryContactId: contact?.id ?? null,
  });
  const pipeline = data.pipelines[0];

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
          companyId: data.company?.id ?? null,
          primaryContactId: data.primaryContact?.id ?? null,
          ownerId: ctx.userId,
          expectedCloseDate: null,
          lostReason: null,
          customFields: {},
        }}
      />
    </>
  );
}
