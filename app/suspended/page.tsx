import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import SignOutButton from "@/components/auth/sign-out-button";

const ACCOUNTS_EMAIL =
  process.env.NEXT_PUBLIC_ACCOUNTS_EMAIL ?? "accounts@youmimic.com";
const ENTERPRISE_EMAIL =
  process.env.NEXT_PUBLIC_ENTERPRISE_EMAIL ?? "enterprise@youmimic.com";

export const metadata = {
  title: "Account Suspended — YouMimic Portal",
};

export default async function SuspendedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const isEnterpriseReason = reason === "enterprise";

  const session = await auth();

  // Only relevant for the "your own account is suspended" case: if they also
  // belong to a currently-active enterprise, point them at their enterprise
  // admin as an extra avenue alongside emailing us directly.
  let activeEnterpriseOwnerEmail: string | null = null;
  if (!isEnterpriseReason && session?.user?.id) {
    const membership = await prisma.enterpriseMember.findFirst({
      where: { userId: session.user.id, enterprise: { status: "active" } },
      select: { enterprise: { select: { owner: { select: { email: true } } } } },
    });
    activeEnterpriseOwnerEmail = membership?.enterprise.owner.email ?? null;
  }

  const contactEmail = isEnterpriseReason ? ENTERPRISE_EMAIL : ACCOUNTS_EMAIL;

  return (
    <main className="container mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-destructive" />
            <CardTitle className="text-xl">
              {isEnterpriseReason ? "Enterprise account suspended" : "Account suspended"}
            </CardTitle>
          </div>
          <CardDescription>
            {isEnterpriseReason
              ? "Your enterprise account has been suspended and you cannot access the portal at this time."
              : "Your account has been suspended and you cannot access the portal at this time."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If you believe this is an error or would like to appeal, please
            contact us at{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {contactEmail}
            </a>
            .
          </p>

          {!isEnterpriseReason && activeEnterpriseOwnerEmail && (
            <p className="text-sm text-muted-foreground">
              Since your enterprise account is still active, you can also
              reach out to your enterprise administrator (
              <a
                href={`mailto:${activeEnterpriseOwnerEmail}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {activeEnterpriseOwnerEmail}
              </a>
              ) for help.
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <SignOutButton />
            <Button asChild variant="outline" className="w-full sm:flex-1">
              <Link href="/login">Back to login</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
