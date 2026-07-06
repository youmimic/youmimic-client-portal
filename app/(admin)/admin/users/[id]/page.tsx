import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserActions } from "@/components/admin/user-actions";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.adminRole) redirect("/dashboard");

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      adminRole: true,
      isSuspended: true,
      suspendedAt: true,
      suspensionReason: true,
      sessionVersion: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          planType: true,
          status: true,
          ownerType: true,
          currentPeriodEnd: true,
        },
      },
      enterprises: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
        },
      },
      adminLogsAsTarget: {
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 20,
        select: {
          id: true,
          action: true,
          reason: true,
          createdAt: true,
          adminUser: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!user) notFound();

  const isSelf = session.user.id === user.id;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-1 text-sm text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <Link href="/admin" className="hover:text-foreground transition-colors">
          Admin
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <Link
          href="/admin/users"
          className="hover:text-foreground transition-colors"
        >
          Users
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground font-medium">{user.name}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      {isSelf ? (
        <p className="text-sm text-muted-foreground italic">
          Actions are unavailable — you cannot act on your own account.
        </p>
      ) : (
        <UserActions userId={user.id} isSuspended={user.isSuspended} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="User ID" value={user.id} mono />
            <DetailRow label="Name" value={user.name} />
            <DetailRow label="Email" value={user.email} />
            <DetailRow
              label="Email Verified"
              value={user.emailVerified ? "Yes" : "No"}
              valueClass={
                user.emailVerified
                  ? "text-green-600 dark:text-green-400"
                  : "text-destructive"
              }
            />
            <DetailRow
              label="Joined"
              value={user.createdAt.toLocaleDateString("en-AU", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            />
            <DetailRow
              label="Session Version"
              value={String(user.sessionVersion)}
              mono
            />
          </CardContent>
        </Card>

        {/* Account status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow
              label="Admin Role"
              value={
                user.adminRole ? user.adminRole.replace(/_/g, " ") : "None"
              }
              valueClass={
                user.adminRole
                  ? "font-medium text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground"
              }
            />
            <DetailRow
              label="Status"
              value={user.isSuspended ? "Suspended" : "Active"}
              valueClass={
                user.isSuspended
                  ? "font-medium text-destructive"
                  : "font-medium text-green-600 dark:text-green-400"
              }
            />
            {user.suspendedAt && (
              <DetailRow
                label="Suspended At"
                value={user.suspendedAt.toLocaleString("en-AU", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
            )}
            {user.suspensionReason && (
              <DetailRow
                label="Suspension Reason"
                value={user.suspensionReason}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {user.subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscriptions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">
                      Plan
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                      Owner Type
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">
                      Period End
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {user.subscriptions.map((sub) => (
                    <tr key={sub.id}>
                      <td className="py-2 pr-4 font-medium">{sub.planType}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            sub.status === "ACTIVE"
                              ? "bg-green-500/10 text-green-600 dark:text-green-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground">
                        {sub.ownerType}
                      </td>
                      <td className="py-2 hidden md:table-cell text-muted-foreground">
                        {sub.currentPeriodEnd
                          ? sub.currentPeriodEnd.toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Owned enterprises */}
      {user.enterprises.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Owned Enterprises</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {user.enterprises.map((ent) => (
                    <tr key={ent.id}>
                      <td className="py-2 pr-4 font-medium">{ent.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {ent.status}
                      </td>
                      <td className="py-2 hidden sm:table-cell text-muted-foreground">
                        {ent.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          {user.adminLogsAsTarget.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin actions recorded for this user.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">
                      Action
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                      Performed By
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">
                      Reason
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {user.adminLogsAsTarget.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground">
                        {log.adminUser.name ?? log.adminUser.email}
                      </td>
                      <td className="py-2 pr-4 hidden md:table-cell text-muted-foreground max-w-xs truncate">
                        {log.reason ?? "—"}
                      </td>
                      <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                        {log.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={`break-all text-right ${mono ? "font-mono text-xs" : ""} ${valueClass ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}
