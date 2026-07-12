// app/invite/[token]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Mail } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { acceptInvite } from "@/lib/invites/accept-invite";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SignOutButton from "@/components/auth/sign-out-button";
import {
  InviteShell,
  InvalidInviteCard,
  AlreadyHandledCard,
} from "@/components/invite/invite-status-cards";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Accept invite — YouMimic Portal",
};

function WrongAccountCard({
  invitedEmail,
  enterpriseName,
}: {
  invitedEmail: string;
  enterpriseName: string;
}) {
  return (
    <InviteShell>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-xl">Wrong account signed in</CardTitle>
        </div>
        <CardDescription>
          You&apos;re signed in with a different email address than the one
          this invite to join {enterpriseName} was sent to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sign out and sign back in with{" "}
          <strong className="text-foreground">{invitedEmail}</strong> to
          accept this invite.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <SignOutButton />
          <Button asChild variant="outline" className="w-full sm:flex-1">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </CardContent>
    </InviteShell>
  );
}

function SuccessCard({ enterpriseName }: { enterpriseName: string }) {
  return (
    <InviteShell>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          <CardTitle className="text-xl">You&apos;re in</CardTitle>
        </div>
        <CardDescription>
          You&apos;ve joined {enterpriseName} successfully.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/dashboard">Continue to dashboard</Link>
        </Button>
      </CardContent>
    </InviteShell>
  );
}

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();

  const invite = await prisma.invite.findUnique({
    where: { token },
    select: {
      email: true,
      status: true,
      enterprise: { select: { name: true } },
    },
  });

  if (!invite) {
    return <InvalidInviteCard />;
  }

  if (invite.status !== "pending") {
    return <AlreadyHandledCard />;
  }

  if (!session?.user) {
    // Route existing accounts through login; brand-new invitees have no
    // password to log in with, so they need the dedicated join/signup page.
    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });

    if (existingUser) {
      const query = new URLSearchParams({
        callbackUrl: `/invite/${token}`,
        email: invite.email,
      });
      redirect(`/login?${query.toString()}`);
    }

    redirect(`/invite/${token}/join`);
  }

  const signedInEmail = session.user.email?.toLowerCase() ?? "";
  if (signedInEmail !== invite.email.toLowerCase()) {
    return (
      <WrongAccountCard
        invitedEmail={invite.email}
        enterpriseName={invite.enterprise.name}
      />
    );
  }

  const result = await acceptInvite(token, session.user.id);

  if (result.status === "not_found") {
    return <InvalidInviteCard />;
  }

  if (result.status === "not_pending") {
    return <AlreadyHandledCard />;
  }

  return <SuccessCard enterpriseName={result.enterpriseName} />;
}
