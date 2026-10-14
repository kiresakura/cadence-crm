import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page";
import { CompanyForm } from "@/components/records/company-form";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";

import { loadCompanyFormData } from "../form-data";

export const metadata: Metadata = { title: "New company" };

export default async function NewCompanyPage() {
  const { ctx } = await requirePageContext();
  if (!can(ctx.role, "records:write")) redirect("/companies");
  const data = await loadCompanyFormData(ctx);
  return (
    <>
      <PageHeader title="New company" backHref="/companies" backLabel="Companies" />
      <CompanyForm {...data} />
    </>
  );
}
