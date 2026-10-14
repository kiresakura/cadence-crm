import type { Ctx } from "@/server/permissions";
import { companyOptions } from "@/server/services/companies";
import { listFieldDefinitions } from "@/server/services/custom-fields";
import { memberOptions } from "@/server/services/members";
import { listTags } from "@/server/services/tags";

/** Everything the contact form needs for its pickers. */
export async function loadContactFormData(ctx: Ctx) {
  const [companies, members, tags, fields] = await Promise.all([
    companyOptions(ctx),
    memberOptions(ctx),
    listTags(ctx),
    listFieldDefinitions(ctx, "CONTACT"),
  ]);
  return {
    companies,
    members,
    tags: tags.map(({ id, name, color }) => ({ id, name, color })),
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
