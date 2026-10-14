import {
  BarChart3,
  FileSpreadsheet,
  GitMerge,
  KanbanSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getRequestContext } from "@/server/next/request";

const FEATURES = [
  {
    icon: Users,
    title: "Contacts and companies",
    text: "Search, filter and tag people and organisations, with a full activity timeline.",
  },
  {
    icon: KanbanSquare,
    title: "Deal pipelines",
    text: "Drag deals across stages. Won and lost stages close deals with a reason.",
  },
  {
    icon: BarChart3,
    title: "Forecasting",
    text: "Open pipeline, weighted forecast, win rate and revenue trends at a glance.",
  },
  {
    icon: GitMerge,
    title: "Duplicate merge",
    text: "Spot contacts sharing an email or phone and merge their history safely.",
  },
  {
    icon: FileSpreadsheet,
    title: "CSV import and export",
    text: "Map columns, preview, skip duplicates and get a row-by-row error report.",
  },
  {
    icon: ShieldCheck,
    title: "Teams and roles",
    text: "Separate workspaces with owner, admin, member and read-only viewer roles.",
  },
];

export default async function HomePage() {
  if (await getRequestContext()) redirect("/dashboard");
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        <section className="py-16 text-center sm:py-24">
          <p className="mb-4 inline-flex rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Open source · Next.js · PostgreSQL
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            The CRM that keeps your sales team in rhythm
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Cadence brings contacts, companies, deals and follow-ups into one fast, tidy workspace —
            with the permissions and audit trail a growing team needs.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/login">Explore the demo</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/register">Create a workspace</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border bg-card p-5">
              <feature.icon className="size-5 text-primary" />
              <h2 className="mt-3 font-medium">{feature.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{feature.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Cadence CRM · MIT licensed
      </footer>
    </div>
  );
}
