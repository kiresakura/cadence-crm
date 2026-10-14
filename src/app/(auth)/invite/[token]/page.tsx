import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ROLE_LABELS } from "@/lib/format";
import { getRequestContext } from "@/server/next/request";
import {
  INVALID_INVITATION_MESSAGE,
  findInvitation,
  maskEmail,
} from "@/server/services/invitations";

import { switchAccountForInvitationAction } from "../../actions";
import { InviteDecision, InviteRegisterForm } from "./invite-forms";

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invitation = await findInvitation(token);

  if (!invitation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invitation unavailable</CardTitle>
          <CardDescription>{INVALID_INVITATION_MESSAGE}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Ask the person who invited you for a new link, or{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            sign in
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  const role = ROLE_LABELS[invitation.role];
  const request = await getRequestContext();

  if (!request) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Join {invitation.workspaceName}</CardTitle>
          <CardDescription>
            You have been invited to {invitation.workspaceName} as {role}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <Button asChild variant="outline" className="w-full">
            <Link href={`/login?next=/invite/${token}`}>Sign in to accept</Link>
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> or <Separator className="flex-1" />
          </div>
          <div className="grid gap-4">
            <h2 className="text-sm font-semibold">Create an account</h2>
            <InviteRegisterForm token={token} email={invitation.email} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (request.user.email !== invitation.email) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Use the invited account</CardTitle>
          <CardDescription>
            This invitation to {invitation.workspaceName} was sent to {maskEmail(invitation.email)}.
            Sign in with that account to accept it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={switchAccountForInvitationAction.bind(null, token)}>
            <Button type="submit" variant="outline" className="w-full">
              Sign out and switch account
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          Join {invitation.workspaceName} as {role}
        </CardTitle>
        <CardDescription>
          You are signed in as {request.user.email}. Accepting adds this workspace to your workspace
          switcher.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InviteDecision token={token} />
      </CardContent>
    </Card>
  );
}
