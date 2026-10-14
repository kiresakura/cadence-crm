import type { Metadata } from "next";

import { requirePageContext } from "@/server/next/request";
import { listPipelines } from "@/server/services/pipelines";

import { NewPipelineForm, PipelineEditor } from "./pipeline-editor";

export const metadata: Metadata = { title: "Pipelines" };

export default async function PipelinesSettingsPage() {
  const { ctx } = await requirePageContext();
  const pipelines = await listPipelines(ctx);
  return (
    <div className="grid gap-6">
      {pipelines.map((pipeline) => (
        <PipelineEditor
          key={pipeline.id}
          canDelete={pipelines.length > 1}
          pipeline={{
            id: pipeline.id,
            name: pipeline.name,
            stages: pipeline.stages.map((stage) => ({
              id: stage.id,
              name: stage.name,
              probability: stage.probability,
              type: stage.type,
              deals: stage._count.deals,
            })),
          }}
        />
      ))}
      <NewPipelineForm />
    </div>
  );
}
