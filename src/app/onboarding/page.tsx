import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRequestContext } from "@/server/next/request";

import { WorkspaceForm } from "./workspace-form";

export const metadata: Metadata = { title: "Create a workspace" };

export default async function OnboardingPage() {
  const request = await getRequestContext();
  if (!request) redirect("/login");
  if (request.ctx) redirect("/dashboard");
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <Logo className="mb-8" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Create a workspace</CardTitle>
          <CardDescription>
            You are not a member of any workspace yet. Create one to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceForm />
        </CardContent>
      </Card>
    </div>
  );
}
