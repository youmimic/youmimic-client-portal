import Link from "next/link";
import { redirect } from "next/navigation";
import { Film } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { VideoStatusBadge } from "@/components/dashboard/video/video-status-badge";
import { getUsageSummary } from "@/lib/usage/summary";
import { formatCurrencyCents, formatShortDate } from "@/lib/format";
import { ENGINE_LABEL, formatDuration, videoTitle } from "@/lib/video-display";

export const metadata = {
  title: "Usage | YouMimic Portal",
};

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function UsagePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const usage = await getUsageSummary(session.user.id);
  const empty = usage.videosStarted === 0 && usage.recent.length === 0;

  return (
    <div className="space-y-6">
      <section aria-labelledby="usage-period" className="space-y-3">
        <div>
          <h2 id="usage-period" className="text-base font-semibold tracking-tight">
            This billing period
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatShortDate(usage.periodStart)} to {formatShortDate(usage.periodEnd)}. Figures are estimates based on
            the length of your finished videos.
          </p>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Videos made" value={String(usage.videosStarted)} hint={`${usage.videosCompleted} finished`} />
          <Stat
            label="Video length"
            value={usage.completedSeconds > 0 ? formatDuration(usage.completedSeconds) : "0s"}
            hint="Finished videos only"
          />
          <Stat label="Estimated spend" value={formatCurrencyCents(usage.estimatedCostCents)} />
          <Stat label="Credits used" value={usage.creditsUsed.toFixed(1)} hint="Includes videos still being made" />
        </dl>

        <p className="text-sm text-muted-foreground">
          There is no monthly credit limit on your plan at the moment, so nothing is blocked. If that changes, your
          remaining balance will show here.
        </p>
      </section>

      {empty ? (
        <EmptyState
          icon={Film}
          title="No videos this billing period"
          description="Once you make a video, its length and estimated cost will show here."
          action={
            <Button asChild>
              <Link href="/dashboard/avatars">Create a video</Link>
            </Button>
          }
        />
      ) : (
        <>
          {usage.byEngine.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By avatar quality</CardTitle>
                <CardDescription>Each option is priced per second of finished video.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y bg-muted/50 text-left">
                        <th className="px-4 py-2.5 font-medium text-muted-foreground">Option</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground">Videos</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground">Length</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground">Credits</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Estimated cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {usage.byEngine.map((row) => (
                        <tr key={row.engine}>
                          <td className="px-4 py-3 font-medium">{ENGINE_LABEL[row.engine]}</td>
                          <td className="px-4 py-3 tabular-nums">{row.videos}</td>
                          <td className="px-4 py-3 tabular-nums">{row.seconds > 0 ? formatDuration(row.seconds) : "0s"}</td>
                          <td className="px-4 py-3 tabular-nums">{row.credits.toFixed(1)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatCurrencyCents(row.costCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent videos</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {usage.recent.map((v) => (
                <Link
                  key={v.id}
                  href={v.projectId ? `/dashboard/videos/projects/${v.projectId}` : `/dashboard/videos/${v.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{videoTitle(v)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatShortDate(v.createdAt)} · {ENGINE_LABEL[v.engine]}
                      {v.durationSeconds != null && ` · ${formatDuration(v.durationSeconds)}`}
                      {v.estimatedCostCents != null && ` · ~${formatCurrencyCents(v.estimatedCostCents)}`}
                    </span>
                  </span>
                  <VideoStatusBadge status={v.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
