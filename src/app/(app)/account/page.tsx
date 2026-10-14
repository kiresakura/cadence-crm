import type { Metadata } from "next";

import { PageHeader, Section } from "@/components/page";
import { requirePageContext } from "@/server/next/request";

import { PasswordForm, ProfileForm } from "./account-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { user } = await requirePageContext();
  const timeZones = Intl.supportedValuesOf("timeZone");
  return (
    <>
      <PageHeader title="Your account" description={user.email} />
      <div className="grid max-w-2xl gap-6">
        <Section title="Profile">
          <ProfileForm
            name={user.name}
            timezone={user.timezone}
            timeZones={
              timeZones.includes(user.timezone) ? timeZones : [user.timezone, ...timeZones]
            }
          />
        </Section>
        <Section title="Change password">
          <PasswordForm />
        </Section>
      </div>
    </>
  );
}
