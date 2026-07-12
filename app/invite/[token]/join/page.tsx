// app/invite/[token]/join/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InviteShell,
  InvalidInviteCard,
  AlreadyHandledCard,
} from "@/components/invite/invite-status-cards";
import JoinForm from "./join-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Join your team — YouMimic Portal",
};

export default async function InviteJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const session = await auth();
  if (session?.user) {
    redirect(`/invite/${token}`);
  }

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

  return (
    <InviteShell>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">
          Join {invite.enterprise.name}
        </CardTitle>
        <CardDescription>
          Set a password to create your account and accept the invite.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <JoinForm token={token} email={invite.email} />
      </CardContent>
    </InviteShell>
  );
}
