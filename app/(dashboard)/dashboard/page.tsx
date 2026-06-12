// app/(dashboard)/dashboard/page.tsx
import {
  ArrowUpRight,
  CreditCard,
  Activity,
  ShieldCheck,
  Sparkles,
  Clock3,
  BellRing,
  Plus,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"

const stats = [
  {
    title: "Projects",
    value: "18",
    note: "+3 this month",
    icon: Sparkles,
  },
  {
    title: "Security Score",
    value: "94%",
    note: "Excellent posture",
    icon: ShieldCheck,
  },
  {
    title: "Active Sessions",
    value: "07",
    note: "2 new today",
    icon: Activity,
  },
  {
    title: "Billing Usage",
    value: "$1,284",
    note: "72% of monthly cap",
    icon: CreditCard,
  },
]

const activity = [
  "You verified your email and secured your account.",
  "A new API token was created for dashboard integrations.",
  "System sync completed successfully across 3 workspaces.",
  "Two pending notifications need your review.",
]

export default function DashboardPage() {
  return (
    <main className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-background to-muted/30 shadow-sm">
          <CardHeader className="space-y-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                System synced
              </Badge>
              <Button variant="outline" size="sm" className="gap-2">
                View report
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl tracking-tight">
                Your workspace is calm, sharp, and fully in motion.
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm md:text-base">
                Track progress, monitor account health, and move through your
                daily actions from one beautifully structured command center.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border/50 bg-background/80 p-4 backdrop-blur">
              <p className="text-sm text-muted-foreground">Profile completion</p>
              <p className="mt-2 text-2xl font-semibold">82%</p>
              <Progress value={82} className="mt-4" />
            </div>
            <div className="rounded-xl border border-border/50 bg-background/80 p-4 backdrop-blur">
              <p className="text-sm text-muted-foreground">Pending reviews</p>
              <p className="mt-2 text-2xl font-semibold">06</p>
              <p className="mt-4 text-xs text-muted-foreground">
                Last update 12 minutes ago
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/80 p-4 backdrop-blur">
              <p className="text-sm text-muted-foreground">Next milestone</p>
              <p className="mt-2 text-2xl font-semibold">Launch prep</p>
              <p className="mt-4 text-xs text-muted-foreground">
                Scheduled for Monday, 9:00 AM
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>
              The things you are most likely to need next.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button className="justify-start gap-2 rounded-xl">
              <Plus className="h-4 w-4" />
              Create new project
            </Button>
            <Button variant="outline" className="justify-start gap-2 rounded-xl">
              <BellRing className="h-4 w-4" />
              Review alerts
            </Button>
            <Button variant="outline" className="justify-start gap-2 rounded-xl">
              <ShieldCheck className="h-4 w-4" />
              Security settings
            </Button>
            <Button variant="outline" className="justify-start gap-2 rounded-xl">
              <Clock3 className="h-4 w-4" />
              View recent activity
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon

          return (
            <Card key={stat.title} className="border-border/60 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>{stat.title}</CardDescription>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight">
                  {stat.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stat.note}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              A composed stream of what changed in your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activity.map((item, index) => (
              <div key={item}>
                <div className="flex gap-3">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="space-y-1">
                    <p className="text-sm leading-6">{item}</p>
                    <p className="text-xs text-muted-foreground">
                      {index + 1} hour{index === 0 ? "" : "s"} ago
                    </p>
                  </div>
                </div>
                {index < activity.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Account health</CardTitle>
            <CardDescription>
              A quick read on protection and readiness.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Email verified</span>
                <span className="font-medium">Complete</span>
              </div>
              <Progress value={100} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">2FA setup</span>
                <span className="font-medium">In progress</span>
              </div>
              <Progress value={58} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Profile strength</span>
                <span className="font-medium">Strong</span>
              </div>
              <Progress value={82} />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}