import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ShieldAlert, ShieldCheck, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function formatRelative(date: Date): string {
  const diffMs = new Date().getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default async function AdminOverviewPage() {
  const session = await auth();
  if (!session?.user?.adminRole) redirect("/dashboard");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalUsers, suspendedUsers, adminUsers, recentActionsCount, recentLogs] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.user.count({ where: { adminRole: { not: null } } }),
      prisma.adminLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.adminLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 10,
        select: {
          id: true,
          action: true,
          createdAt: true,
          adminUser: { select: { id: true, name: true, email: true } },
          targetUser: { select: { id: true, name: true, email: true } },
          entityId: true,
        },
      }),
    ]);

  const kpis = [
    {
      label: "Total Users",
      value: totalUsers.toLocaleString(),
      icon: Users,
      colorClass: "text-blue-500",
    },
    {
      label: "Suspended",
      value: suspendedUsers.toLocaleString(),
      icon: ShieldAlert,
      colorClass: "text-destructive",
    },
    {
      label: "Admin Users",
      value: adminUsers.toLocaleString(),
      icon: ShieldCheck,
      colorClass: "text-amber-500",
    },
    {
      label: "Actions (30d)",
      value: recentActionsCount.toLocaleString(),
      icon: Activity,
      colorClass: "text-green-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform health at a glance
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, colorClass }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${colorClass}`} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Admin Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin activity recorded yet.
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
                      By
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">
                      Target
                    </th>
                    <th className="pb-2 pr-0 font-medium text-muted-foreground text-right">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground">
                        {log.adminUser.name ?? log.adminUser.email}
                      </td>
                      <td className="py-2 pr-4 hidden md:table-cell text-muted-foreground">
                        {log.targetUser
                          ? (log.targetUser.name ?? log.targetUser.email)
                          : (log.entityId ?? "—")}
                      </td>
                      <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                        {formatRelative(log.createdAt)}
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
