import type { Ctx } from "@/server/permissions";
import { listFieldDefinitions } from "@/server/services/custom-fields";
import { memberOptions } from "@/server/services/members";
import { listPipelines } from "@/server/services/pipelines";
import { companyOption, contactOption } from "@/server/services/record-options";

/** Everything the deal form needs; pickers start with only the linked records. */
export async function loadDealFormData(
  ctx: Ctx,
  linked: { companyId: string | null; primaryContactId: string | null },
) {
  const [pipelines, company, primaryContact, members, fields] = await Promise.all([
    listPipelines(ctx),
    companyOption(ctx, linked.companyId),
    contactOption(ctx, linked.primaryContactId),
    memberOptions(ctx),
    listFieldDefinitions(ctx, "DEAL"),
  ]);
  return {
    pipelines: pipelines.map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
      stages: pipeline.stages.map(({ id, name, type, probability }) => ({
        id,
        name,
        type,
        probability,
      })),
    })),
    company,
    primaryContact,
    members,
    fields: fields.map(({ id, key, label, type, options, required }) => ({
      id,
      key,
      label,
      type,
      options,
      required,
    })),
  };
}
