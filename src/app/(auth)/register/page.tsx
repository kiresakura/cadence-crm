import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRequestContext } from "@/server/next/request";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function RegisterPage() {
  if (await getRequestContext()) redirect("/dashboard");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your workspace</CardTitle>
        <CardDescription>You will be the owner. Invite your team afterwards.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <RegisterForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
