import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canViewEnterprises } from "@/lib/admin/rbac";
import { ENTITY_TYPES } from "@/lib/admin/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminEnterpriseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.adminRole) redirect("/dashboard");

  const actorRole = session.user.adminRole as AdminRole;
  if (!canViewEnterprises(actorRole)) redirect("/dashboard");

  const { id } = await params;

  const enterprise = await prisma.enterprise.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      owner: { select: { id: true, email: true, name: true } },
      subscriptions: {
        select: { planType: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      members: {
        select: {
          id: true,
          user: { select: { id: true, email: true, name: true } },
          role: { select: { name: true } },
        },
      },
      invites: {
        select: {
          id: true,
          email: true,
          status: true,
          createdAt: true,
          role: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!enterprise) notFound();

  const relatedIds = [
    enterprise.id,
    ...enterprise.members.map((m) => m.id),
    ...enterprise.invites.map((i) => i.id),
  ];

  const auditLog = await prisma.adminLog.findMany({
    where: {
      entityType: {
        in: [
          ENTITY_TYPES.ENTERPRISE,
          ENTITY_TYPES.ENTERPRISE_MEMBER,
          ENTITY_TYPES.ENTERPRISE_INVITE,
        ],
      },
      entityId: { in: relatedIds },
    },
    select: {
      id: true,
      action: true,
      reason: true,
      createdAt: true,
      adminUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 20,
  });

  const subscription = enterprise.subscriptions[0];

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
          href="/admin/enterprises"
          className="hover:text-foreground transition-colors"
        >
          Enterprises
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground font-medium">
          {enterprise.name}
        </span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">{enterprise.name}</h1>
        <p className="text-sm text-muted-foreground">
          {enterprise.owner ? enterprise.owner.email : "No owner"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enterprise Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Enterprise ID" value={enterprise.id} mono />
            <DetailRow label="Name" value={enterprise.name} />
            <DetailRow label="Plan Type" value={subscription?.planType ?? "None"} />
            <DetailRow
              label="Subscription Status"
              value={subscription?.status ?? "None"}
              valueClass={
                subscription?.status === "ACTIVE" || subscription?.status === "TRIALING"
                  ? "font-medium text-green-600 dark:text-green-400"
                  : undefined
              }
            />
            <DetailRow
              label="Created"
              value={enterprise.createdAt.toLocaleDateString("en-AU", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            />
          </CardContent>
        </Card>

        {/* Owner */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Owner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {enterprise.owner ? (
              <>
                <DetailRow label="Name" value={enterprise.owner.name ?? "—"} />
                <DetailRow label="Email" value={enterprise.owner.email} />
                <DetailRow label="User ID" value={enterprise.owner.id} mono />
              </>
            ) : (
              <p className="text-muted-foreground">No owner on record.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          {enterprise.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                      Name
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground">
                      Role
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {enterprise.members.map((member) => (
                    <tr key={member.id}>
                      <td className="py-2 pr-4 font-medium">
                        {member.user.email}
                      </td>
                      <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground">
                        {member.user.name ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {member.role.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invites */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invites</CardTitle>
        </CardHeader>
        <CardContent>
          {enterprise.invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending or recent invites.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                      Role
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      Sent
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {enterprise.invites.map((invite) => (
                    <tr key={invite.id}>
                      <td className="py-2 pr-4 font-medium">{invite.email}</td>
                      <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground">
                        {invite.role.name}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {invite.status}
                        </span>
                      </td>
                      <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                        {invite.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin actions recorded for this enterprise.
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
                  {auditLog.map((log) => (
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
