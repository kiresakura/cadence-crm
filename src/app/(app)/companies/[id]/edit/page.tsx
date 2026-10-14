import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page";
import { CompanyForm } from "@/components/records/company-form";
import { NotFoundError } from "@/server/errors";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";
import { companyToInput, getCompany } from "@/server/services/companies";

import { loadCompanyFormData } from "../../form-data";

export const metadata: Metadata = { title: "Edit company" };

export default async function EditCompanyPage({ params }: PageProps<"/companies/[id]/edit">) {
  const { id } = await params;
  const { ctx } = await requirePageContext();
  if (!can(ctx.role, "records:write")) redirect(`/companies/${id}`);
  const company = await getCompany(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const data = await loadCompanyFormData(ctx, company.ownerId);
  return (
    <>
      <PageHeader
        title={`Edit ${company.name}`}
        backHref={`/companies/${id}`}
        backLabel="Back to company"
      />
      <CompanyForm {...data} companyId={id} values={companyToInput(company)} />
    </>
  );
}
