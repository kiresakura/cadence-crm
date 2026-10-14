import type { Ctx } from "@/server/permissions";
import { listFieldDefinitions } from "@/server/services/custom-fields";
import { memberOptions } from "@/server/services/members";
import { listTags } from "@/server/services/tags";

export async function loadCompanyFormData(ctx: Ctx) {
  const [members, tags, fields] = await Promise.all([
    memberOptions(ctx),
    listTags(ctx),
    listFieldDefinitions(ctx, "COMPANY"),
  ]);
  return {
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
