import type { Ctx } from "@/server/permissions";
import { listFieldDefinitions } from "@/server/services/custom-fields";
import { memberOptions } from "@/server/services/members";
import { companyOption } from "@/server/services/record-options";
import { listTags } from "@/server/services/tags";

/** Everything the contact form needs for its pickers. */
export async function loadContactFormData(ctx: Ctx, companyId: string | null = null) {
  const [company, members, tags, fields] = await Promise.all([
    companyOption(ctx, companyId),
    memberOptions(ctx),
    listTags(ctx),
    listFieldDefinitions(ctx, "CONTACT"),
  ]);
  return {
    company,
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
