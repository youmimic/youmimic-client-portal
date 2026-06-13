import Link from "next/link";
import {
  Zap,
  Layers,
  Globe,
  Building2,
  Users,
  Radio,
  Megaphone,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const values = [
  {
    icon: Zap,
    title: "Immediate deployment",
    body: "Record one session and generate production-quality video immediately—no reshoots, no scheduling, no waiting.",
  },
  {
    icon: Layers,
    title: "Production at scale",
    body: "Your avatar produces an unlimited number of videos in parallel. One person's presence, organization-wide reach.",
  },
  {
    icon: Globe,
    title: "Multilingual by default",
    body: "Deliver the same message in any language from a single source recording—no re-recording, no dubbing.",
  },
  {
    icon: Building2,
    title: "Enterprise governance",
    body: "Role-based controls, brand guidelines, and audit trails built in. Deploy responsibly at every level.",
  },
];

const steps = [
  {
    n: "01",
    title: "Record your session",
    body: "Attend a short, guided recording session. We capture your likeness, voice, and professional presence—once.",
  },
  {
    n: "02",
    title: "Your avatar is built",
    body: "Our platform processes your session and creates a precise AI avatar that reflects your professional identity.",
  },
  {
    n: "03",
    title: "Generate and deploy",
    body: "Upload a script. Your avatar delivers a polished, on-brand video ready for any channel and any audience.",
  },
];

const useCases = [
  {
    icon: Users,
    title: "Employee training",
    body: "Deliver consistent onboarding, compliance training, and skill development across global teams at scale.",
  },
  {
    icon: Radio,
    title: "Customer communication",
    body: "Send personalized video updates, product announcements, and support responses without re-filming.",
  },
  {
    icon: Megaphone,
    title: "Marketing and content",
    body: "Produce campaign assets, product walkthroughs, and localized advertising with a consistent, on-brand presenter.",
  },
  {
    icon: BookOpen,
    title: "Internal updates",
    body: "Replace written memos with professional video messages from leadership—without booking a camera crew.",
  },
];

const plans = [
  {
    name: "Creator",
    tagline: "For individuals and focused teams getting started with AI video.",
    price: "Contact us",
    features: [
      "One personal AI avatar",
      "Core video generation",
      "Standard processing queue",
      "Email support",
    ],
    cta: "Get started",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Enterprise",
    tagline: "For organizations scaling AI video communication across departments.",
    price: "Custom pricing",
    features: [
      "Multiple avatars per account",
      "Priority video processing",
      "Brand governance controls",
      "Dedicated account manager",
    ],
    cta: "Start free trial",
    href: "/signup",
    highlight: true,
  },
  {
    name: "Custom",
    tagline: "For regulated industries and complex integration requirements.",
    price: "Talk to us",
    features: [
      "Unlimited avatar accounts",
      "Custom SLA and compliance",
      "API access and integration support",
      "White-glove onboarding",
    ],
    cta: "Contact sales",
    href: "/signup",
    highlight: false,
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            YouMimic
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 sm:py-32 md:py-40">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
            AI-powered video avatars for business
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            Say it once.
            <br />
            Scale it everywhere.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            YouMimic creates a professional AI avatar from a single recorded
            session. Deploy consistent, on-brand video communication across
            every language, market, and channel—without a camera crew.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              className="h-11 px-6 text-sm font-medium"
            >
              <Link href="/signup">Get started free</Link>
            </Button>
            <Button
              variant="outline"
              asChild
              className="h-11 px-6 text-sm font-medium"
            >
              <Link href="/login">Sign in to portal</Link>
            </Button>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Value propositions */}
        <section className="bg-muted/50 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Built for how businesses actually communicate
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                Traditional video production doesn&apos;t scale. YouMimic does.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {values.map(({ icon: Icon, title, body }) => (
                <Card key={title}>
                  <CardHeader>
                    <div className="mb-2 flex size-9 items-center justify-center rounded-lg border border-border bg-background">
                      <Icon className="size-4 text-foreground" />
                    </div>
                    <CardTitle className="text-sm font-medium">
                      {title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                How YouMimic works
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                From your first recording to organization-wide deployment in
                three steps.
              </p>
            </div>
            <div className="grid gap-10 sm:grid-cols-3">
              {steps.map(({ n, title, body }) => (
                <div key={n} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                  <span className="mb-4 inline-flex size-10 items-center justify-center rounded-full bg-foreground text-sm font-semibold tabular-nums text-background">
                    {n}
                  </span>
                  <h3 className="text-base font-medium text-foreground">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Use cases */}
        <section className="bg-muted/50 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Where teams deploy YouMimic
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                One platform. Multiple communication surfaces.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2">
              {useCases.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                    <Icon className="size-4 text-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      {title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Transparent, flexible pricing
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                Start with a single avatar. Scale as your organization grows.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {plans.map(({ name, tagline, price, features, cta, href, highlight }) => (
                <Card
                  key={name}
                  className={cn(
                    "flex flex-col",
                    highlight && "ring-2 ring-foreground"
                  )}
                >
                  <CardHeader>
                    {highlight && (
                      <span className="mb-2 self-start rounded-full bg-foreground px-2.5 py-0.5 text-xs font-medium text-background">
                        Most popular
                      </span>
                    )}
                    <CardTitle className="text-base">{name}</CardTitle>
                    <CardDescription>{tagline}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="mb-4 text-lg font-semibold text-foreground">
                      {price}
                    </p>
                    <ul className="space-y-2">
                      {features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground/60" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      asChild
                      variant={highlight ? "default" : "outline"}
                      className="w-full"
                    >
                      <Link href={href}>{cta}</Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-foreground py-20 text-background sm:py-24">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready to deploy your first AI avatar?
            </h2>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed opacity-70">
              Join teams already using YouMimic to scale professional video
              communication without additional production overhead.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                asChild
                className="h-11 px-6 text-sm font-medium bg-background text-foreground hover:bg-background/90 border-transparent"
              >
                <Link href="/signup">Create your account</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-11 px-6 text-sm font-medium text-background hover:bg-background/10 hover:text-background"
              >
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span>© 2026 YouMimic. All rights reserved.</span>
          <div className="flex gap-6">
            <Link
              href="/login"
              className="transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="transition-colors hover:text-foreground"
            >
              Get started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
