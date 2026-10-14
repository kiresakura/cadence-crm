import type { Ctx } from "@/server/permissions";
import { companyOptions } from "@/server/services/companies";
import { contactOptions } from "@/server/services/contacts";
import { listFieldDefinitions } from "@/server/services/custom-fields";
import { memberOptions } from "@/server/services/members";
import { listPipelines } from "@/server/services/pipelines";

export async function loadDealFormData(ctx: Ctx) {
  const [pipelines, companies, contacts, members, fields] = await Promise.all([
    listPipelines(ctx),
    companyOptions(ctx),
    contactOptions(ctx),
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
    companies,
    contacts: contacts.map(({ id, label }) => ({ id, label })),
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
