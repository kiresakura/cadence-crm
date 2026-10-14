import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page";
import { DealForm } from "@/components/records/deal-form";
import { NotFoundError } from "@/server/errors";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { dealToInput, getDeal } from "@/server/services/deals";

import { loadDealFormData } from "../../form-data";

export const metadata: Metadata = { title: "Edit deal" };

export default async function EditDealPage({ params }: PageProps<"/deals/[id]/edit">) {
  const { id } = await params;
  const { ctx } = await requirePageContext();
  if (!can(ctx.role, "records:write")) redirect(`/deals/${id}`);
  const deal = await getDeal(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const data = await loadDealFormData(ctx, deal);
  return (
    <>
      <PageHeader title={`Edit ${deal.title}`} backHref={`/deals/${id}`} backLabel="Back to deal" />
      <DealForm {...data} dealId={id} values={dealToInput(deal)} />
    </>
  );
}
