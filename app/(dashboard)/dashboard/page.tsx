import Link from "next/link";
import {
  Bot,
  Building2,
  CalendarDays,
  CreditCard,
  ExternalLink,
  Languages,
  Presentation,
  Sparkles,
  UserCircle2,
  Video,
} from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Dashboard — YouMimic Portal",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const displayName = session?.user?.name ?? session?.user?.email ?? "there";

  const enterprise = userId
    ? await prisma.enterprise.findFirst({
        where: { ownerUserId: userId },
        select: { id: true, name: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {displayName}.</p>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          Getting started
        </h2>
        {enterprise ? (
          <BusinessGettingStarted enterpriseName={enterprise.name} />
        ) : (
          <IndividualGettingStarted />
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          External links
        </h2>
        <ExternalLinksSection />
      </div>
    </div>
  );
}

function IndividualGettingStarted() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <GettingStartedCard
        icon={<UserCircle2 className="h-5 w-5 shrink-0" />}
        title="Set up your avatar"
        description="Create your personal AI avatar for use in videos and presentations."
        href="/dashboard/avatars"
        linkLabel="Go to Avatars"
      />
      <GettingStartedCard
        icon={<CalendarDays className="h-5 w-5 shrink-0" />}
        title="Book a capture session"
        description="Schedule a session to record footage for your avatar."
        href="/dashboard/bookings"
        linkLabel="View Bookings"
      />
      <GettingStartedCard
        icon={<CreditCard className="h-5 w-5 shrink-0" />}
        title="Manage your plan"
        description="Review your subscription and billing details."
        href="/dashboard/billing"
        linkLabel="Go to Billing"
      />
    </div>
  );
}

function BusinessGettingStarted({ enterpriseName }: { enterpriseName: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <GettingStartedCard
        icon={<Building2 className="h-5 w-5 shrink-0" />}
        title={enterpriseName}
        description="Your business workspace is set up. Manage your team and enterprise settings."
        href="/dashboard/settings"
        linkLabel="Workspace Settings"
      />
      <GettingStartedCard
        icon={<UserCircle2 className="h-5 w-5 shrink-0" />}
        title="Set up your avatars"
        description="Create AI avatars for your team members and business use cases."
        href="/dashboard/avatars"
        linkLabel="Go to Avatars"
      />
      <GettingStartedCard
        icon={<CreditCard className="h-5 w-5 shrink-0" />}
        title="Enterprise billing"
        description="Review your enterprise subscription and payment history."
        href="/dashboard/billing"
        linkLabel="Go to Billing"
      />
    </div>
  );
}

function GettingStartedCard({
  icon,
  title,
  description,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href={href}
          className="text-sm font-medium text-primary hover:underline"
        >
          {linkLabel} →
        </Link>
      </CardContent>
    </Card>
  );
}

function ExternalLinksSection() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ExternalLinkCard
        icon={<Video className="h-5 w-5 shrink-0" />}
        title="HeyGen"
        description="Open HeyGen in a new tab."
        href="https://app.heygen.com"
        linkLabel="Open HeyGen"
      />
      <ExternalLinkCard
        icon={<Bot className="h-5 w-5 shrink-0" />}
        title="Interactive Avatar"
        description="Launch the interactive avatar experience."
        href="https://app.liveavatar.com/home"
        linkLabel="Launch LiveAvatar"
      />
      <ExternalLinkCard
        icon={<Sparkles className="h-5 w-5 shrink-0" />}
        title="Hologram"
        description="Watch the sneak peek while we get this ready."
        href="https://vimeo.com/1202651661/1f14b9b8a7?fl=ip&fe=ec"
        linkLabel="Watch preview"
        badge="Coming soon"
      />
      <ExternalLinkCard
        icon={<Presentation className="h-5 w-5 shrink-0" />}
        title="PPT to Video"
        description="Turn presentations into video."
        href="https://app.heygen.com/ppt-to-video"
        linkLabel="Open PPT to Video"
      />
      <ExternalLinkCard
        icon={<Languages className="h-5 w-5 shrink-0" />}
        title="Translate"
        description="Open HeyGen Translate."
        href="https://app.heygen.com/video-translate"
        linkLabel="Open Translate"
      />
    </div>
  );
}

function ExternalLinkCard({
  icon,
  title,
  description,
  href,
  linkLabel,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  badge?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
          {badge && (
            <span className="ml-auto inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {badge}
            </span>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {linkLabel}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </a>
      </CardContent>
    </Card>
  );
}
