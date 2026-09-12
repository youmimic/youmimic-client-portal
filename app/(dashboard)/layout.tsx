import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Only USER-owned plans (Creator/Mid Market/Small Business) have no
  // "workspace" concept at all — a membership row only exists for accounts
  // actually tied to an Enterprise, so this is naturally null/omitted for
  // everyone else rather than inventing a workspace label for solo users.
  const membership = await prisma.enterpriseMember.findFirst({
    where: { userId: session.user.id },
    select: {
      enterprise: { select: { name: true } },
      role: { select: { name: true } },
    },
  });

  return (
    <DashboardShell
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
      enterprise={
        membership
          ? { name: membership.enterprise.name, role: membership.role.name }
          : null
      }
    >
      {children}
    </DashboardShell>
  );
}
