import type { Metadata } from "next";

import { requirePageContext } from "@/server/next/request";
import { listTags } from "@/server/services/tags";

import { TagEditor } from "./tag-editor";

export const metadata: Metadata = { title: "Tags" };

export default async function TagsSettingsPage() {
  const { ctx } = await requirePageContext();
  const tags = await listTags(ctx);
  return (
    <TagEditor
      tags={tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        contacts: tag._count.contacts,
        companies: tag._count.companies,
      }))}
    />
  );
}
