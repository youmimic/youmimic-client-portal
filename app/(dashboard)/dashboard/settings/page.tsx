import { redirect } from "next/navigation";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Settings — YouMimic Portal",
};

async function fetchUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      userRoles: {
        select: { role: { select: { name: true } } },
        orderBy: { role: { name: "asc" } },
      },
    },
  });
}

type UserData = NonNullable<Awaited<ReturnType<typeof fetchUser>>>;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 md:grid-cols-[10rem_1fr] md:gap-4 md:items-baseline">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function VerificationBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-yellow-700 dark:text-yellow-400">
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      Not verified
    </span>
  );
}

function RoleChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
      {name}
    </span>
  );
}

function AccountCard({ user }: { user: UserData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Account</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <dl className="divide-y">
          <FieldRow label="Name">{user.name}</FieldRow>
          <FieldRow label="Email">{user.email}</FieldRow>
          <FieldRow label="Email verification">
            <VerificationBadge verified={user.emailVerified} />
          </FieldRow>
          <FieldRow label="Member since">
            {formatDate(user.createdAt)}
          </FieldRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function AccessCard({ user }: { user: UserData }) {
  const roles = user.userRoles.map((ur) => ur.role.name);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Access</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <dl className="divide-y">
          <FieldRow label="Roles">
            {roles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {roles.map((role) => (
                  <RoleChip key={role} name={role} />
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">No roles assigned</span>
            )}
          </FieldRow>
        </dl>
      </CardContent>
    </Card>
  );
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await fetchUser(session.user.id);
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          View your account details and access information.
        </p>
      </div>

      <div className="space-y-4">
        <AccountCard user={user} />
        <AccessCard user={user} />
      </div>
    </div>
  );
}
