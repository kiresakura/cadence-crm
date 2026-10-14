import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";
import { demoAccountsEnabled } from "@/server/env";
import { getRequestContext } from "@/server/next/request";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getRequestContext()) redirect("/dashboard");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const demo = demoAccountsEnabled()
    ? {
        password: DEMO_PASSWORD,
        accounts: DEMO_ACCOUNTS.map(({ label, email }) => ({ label, email })),
      }
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Welcome back. Enter your email and password.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <LoginForm next={next} demo={demo} />
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create a workspace
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
