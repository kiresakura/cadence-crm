import { toCsv } from "../domain/csv";
import type { Ctx } from "../permissions";
import { dateToDateOnly } from "../validation/common";
import { listContactsForExport, type ContactFilters } from "./contacts";
import { listDealsForExport, type DealFilters } from "./deals";

export async function exportContactsCsv(ctx: Ctx, filters: ContactFilters): Promise<string> {
  const contacts = await listContactsForExport(ctx, filters);
  return toCsv(
    [
      { key: "firstName", label: "First name" },
      { key: "lastName", label: "Last name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "jobTitle", label: "Job title" },
      { key: "company", label: "Company" },
      { key: "lifecycleStage", label: "Lifecycle stage" },
      { key: "source", label: "Source" },
      { key: "owner", label: "Owner" },
      { key: "tags", label: "Tags" },
      { key: "createdAt", label: "Created at" },
    ],
    contacts.map((contact) => ({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      jobTitle: contact.jobTitle,
      company: contact.company?.name ?? null,
      lifecycleStage: contact.lifecycleStage,
      source: contact.source,
      owner: contact.owner?.name ?? null,
      tags: contact.tags.map((link) => link.tag.name).join("; "),
      createdAt: contact.createdAt,
    })),
  );
}

export async function exportDealsCsv(ctx: Ctx, filters: DealFilters): Promise<string> {
  const deals = await listDealsForExport(ctx, filters);
  return toCsv(
    [
      { key: "title", label: "Title" },
      { key: "amount", label: "Amount" },
      { key: "currency", label: "Currency" },
      { key: "pipeline", label: "Pipeline" },
      { key: "stage", label: "Stage" },
      { key: "status", label: "Status" },
      { key: "company", label: "Company" },
      { key: "contact", label: "Primary contact" },
      { key: "owner", label: "Owner" },
      { key: "expectedCloseDate", label: "Expected close" },
      { key: "closedAt", label: "Closed at" },
      { key: "lostReason", label: "Lost reason" },
    ],
    deals.map((deal) => ({
      title: deal.title,
      amount: Number(deal.amount.toFixed(2)),
      currency: deal.currency,
      pipeline: deal.pipeline.name,
      stage: deal.stage.name,
      status: deal.stage.type.toLowerCase(),
      company: deal.company?.name ?? null,
      contact: deal.primaryContact
        ? `${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`
        : null,
      owner: deal.owner?.name ?? null,
      expectedCloseDate: dateToDateOnly(deal.expectedCloseDate),
      closedAt: deal.closedAt,
      lostReason: deal.lostReason,
    })),
  );
}
