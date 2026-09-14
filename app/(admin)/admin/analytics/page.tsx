import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Activity, Clock, Eye, Users } from "lucide-react";
import type { AdminRole } from "@/app/generated/prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canViewAnalytics } from "@/lib/admin/rbac";
import { fetchAnalyticsOverview } from "@/lib/ga4/client";
import { AnalyticsTrendChart } from "@/components/admin/analytics-trend-chart";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export default async function AdminAnalyticsPage() {
  const session = await auth();
  if (!session?.user?.adminRole) redirect("/dashboard");

  const actorRole = session.user.adminRole as AdminRole;
  if (!canViewAnalytics(actorRole)) redirect("/admin");

  const result = await fetchAnalyticsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Site traffic from Google Analytics, last 28 days
        </p>
      </div>

      {!result.ok ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium text-foreground">Analytics unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{result.error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Active Users", value: result.data.totals.activeUsers.toLocaleString(), icon: Users, colorClass: "text-blue-500" },
              { label: "Sessions", value: result.data.totals.sessions.toLocaleString(), icon: Activity, colorClass: "text-green-500" },
              { label: "Page Views", value: result.data.totals.pageViews.toLocaleString(), icon: Eye, colorClass: "text-indigo-500" },
              { label: "Avg. Engagement", value: formatDuration(result.data.totals.avgEngagementSeconds), icon: Clock, colorClass: "text-amber-500" },
            ].map(({ label, value, icon: Icon, colorClass }) => (
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
              <CardTitle className="text-base">Active Users (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {result.data.dailyActiveUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data for this period.</p>
              ) : (
                <AnalyticsTrendChart data={result.data.dailyActiveUsers} />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Pages</CardTitle>
              </CardHeader>
              <CardContent>
                {result.data.topPages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data for this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {result.data.topPages.map((page) => (
                        <tr key={page.path}>
                          <td className="py-2 pr-4 truncate max-w-0 font-mono text-xs text-muted-foreground">
                            {page.path}
                          </td>
                          <td className="py-2 text-right font-medium whitespace-nowrap">
                            {page.views.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Traffic Sources</CardTitle>
              </CardHeader>
              <CardContent>
                {result.data.channels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data for this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {result.data.channels.map((channel) => (
                        <tr key={channel.channel}>
                          <td className="py-2 pr-4 text-muted-foreground">{channel.channel}</td>
                          <td className="py-2 text-right font-medium whitespace-nowrap">
                            {channel.sessions.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
