import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { connection } from "next/server";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Cadence CRM",
    template: "%s · Cadence CRM",
  },
  description:
    "A multi-tenant CRM for small sales teams: contacts, companies, deal pipelines, tasks and reporting.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page renders per request so its scripts can carry that request's CSP nonce
  // (see src/proxy.ts); a page prerendered at build time would have its scripts blocked.
  await connection();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster theme="light" richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
