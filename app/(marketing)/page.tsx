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
  Video,
  Cpu,
  Share2,
  Play,
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

// ─── Data ────────────────────────────────────────────────────────────────────

const stats = [
  { value: "3 min", label: "Average generation time" },
  { value: "12+", label: "Supported languages" },
  { value: "500+", label: "Videos generated" },
  { value: "99.9%", label: "Platform uptime" },
];

const features = [
  {
    icon: Zap,
    title: "Immediate deployment",
    body: "Record one session and generate production-quality video immediately. No reshoots, no scheduling, no waiting.",
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
    icon: Video,
    title: "Record your session",
    body: "Attend a short, guided recording session. We capture your likeness, voice, and professional presence—once.",
  },
  {
    n: "02",
    icon: Cpu,
    title: "Your avatar is built",
    body: "Our platform processes your session and creates a precise AI avatar that reflects your professional identity.",
  },
  {
    n: "03",
    icon: Share2,
    title: "Generate and deploy",
    body: "Upload a script. Your avatar delivers a polished, on-brand video ready for any channel and any audience.",
  },
];

const avatars = [
  {
    initial: "S",
    name: "Sarah Chen",
    role: "Head of Marketing",
    status: "Active" as const,
    langs: ["EN", "ZH", "ES", "FR"],
  },
  {
    initial: "M",
    name: "Marcus Reid",
    role: "Training Director",
    status: "Active" as const,
    langs: ["EN", "DE", "JA"],
  },
  {
    initial: "A",
    name: "Anita Sharma",
    role: "Customer Relations",
    status: "Processing" as const,
    langs: ["EN", "HI", "FR"],
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
    tagline:
      "For organizations scaling AI video communication across departments.",
    price: "Custom pricing",
    features: [
      "Multiple avatars per account",
      "Priority video processing",
      "Brand governance controls",
      "Dedicated account manager",
    ],
    cta: "Get Started",
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

// ─── Product mockup — always light surface regardless of theme ────────────────
// Sits against the dark hero; uses explicit palette hex values.

function ProductMockup() {
  return (
    <div
      className="relative w-full max-w-105 overflow-hidden rounded-2xl shadow-2xl"
      style={{
        backgroundColor: "#ECEAE9",
        border: "1px solid rgba(25,24,24,0.12)",
      }}
    >
      {/* Window chrome */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          backgroundColor: "rgba(25,24,24,0.05)",
          borderBottom: "1px solid rgba(25,24,24,0.09)",
        }}
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="size-2.25 rounded-full"
              style={{ backgroundColor: "#604B33", opacity: 0.4 }}
            />
          ))}
        </div>
        <span
          className="flex-1 text-center text-xs font-medium tracking-wide"
          style={{ color: "#604B33" }}
        >
          YouMimic Studio
        </span>
        <div className="size-2.25" />
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        {/* Video preview + status sidebar */}
        <div className="flex gap-3">
          {/* Video area */}
          <div
            className="relative flex-1 overflow-hidden rounded-xl"
            style={{
              backgroundColor: "rgba(25,24,24,0.07)",
              border: "1px solid rgba(25,24,24,0.09)",
              backgroundImage: "url('/hero-bg.jpg')",
              backgroundSize: "cover",
            }}
          >
            <div className="flex aspect-video items-center justify-center">
              <div
                className="flex size-14 items-center justify-center rounded-full text-base font-semibold"
                style={{
                  backgroundColor: "rgba(96,145,140,0.15)",
                  color: "#60918C",
                  boxShadow: "0 0 0 2px rgba(96,145,140,0.20)",
                }}
              >
                SC
              </div>
            </div>
            {/* Play overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="flex size-9 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(25,24,24,0.10)" }}
              >
                <Play className="ml-0.5 size-4" style={{ color: "#604B33" }} />
              </span>
            </div>
            <div
              className="absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: "rgba(236,234,233,0.85)",
                color: "#604B33",
                border: "1px solid rgba(96,75,51,0.15)",
              }}
            >
              Preview
            </div>
          </div>

          {/* Status + languages panel */}
          <div className="flex w-25 shrink-0 flex-col gap-2">
            <div
              className="rounded-lg p-2.5"
              style={{
                backgroundColor: "rgba(25,24,24,0.04)",
                border: "1px solid rgba(25,24,24,0.09)",
              }}
            >
              <p
                className="mb-1 text-[9px] font-medium uppercase tracking-wider"
                style={{ color: "#604B33" }}
              >
                Status
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: "#60918C" }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: "#191818" }}
                >
                  Ready
                </span>
              </div>
            </div>
            <div
              className="rounded-lg p-2.5"
              style={{
                backgroundColor: "rgba(25,24,24,0.04)",
                border: "1px solid rgba(25,24,24,0.09)",
              }}
            >
              <p
                className="mb-1.5 text-[9px] font-medium uppercase tracking-wider"
                style={{ color: "#604B33" }}
              >
                Languages
              </p>
              <div className="flex flex-wrap gap-1">
                {["EN", "ES", "FR", "DE", "ZH"].map((l) => (
                  <span
                    key={l}
                    className="rounded font-mono text-[9px]"
                    style={{
                      backgroundColor: "rgba(154,181,199,0.25)",
                      color: "#191818",
                      border: "1px solid rgba(154,181,199,0.45)",
                      padding: "1px 4px",
                    }}
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Script lines */}
        <div
          className="rounded-xl p-3"
          style={{
            backgroundColor: "rgba(25,24,24,0.04)",
            border: "1px solid rgba(25,24,24,0.09)",
          }}
        >
          <p
            className="mb-2 text-[9px] font-medium uppercase tracking-wider"
            style={{ color: "#604B33" }}
          >
            Script
          </p>
          <div className="space-y-2">
            {[1, 11 / 12, 4 / 5, 3 / 5].map((w, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full"
                style={{
                  width: `${w * 100}%`,
                  backgroundColor:
                    i < 3 ? "rgba(25,24,24,0.12)" : "rgba(25,24,24,0.06)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div
            className="flex items-center gap-2 text-[11px]"
            style={{ color: "#604B33", opacity: 0.7 }}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: "#60918C" }}
            />
            Sarah Chen · Active
          </div>
          <div className="flex gap-1.5">
            <span
              className="rounded-md px-3 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: "rgba(25,24,24,0.06)",
                color: "#191818",
                border: "1px solid rgba(25,24,24,0.10)",
              }}
            >
              Preview
            </span>
            <span
              className="rounded-md px-3 py-1 text-[11px] font-medium"
              style={{ backgroundColor: "#604B33", color: "#ECEAE9" }}
            >
              Generate
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      {/* ── Hero — always dark, palette-atmospheric ───────────────────────── */}
      <section className="relative min-h-150 overflow-hidden lg:min-h-170">
        {/* Layer 1: Background — charcoal fallback; /public/hero-bg.jpg activates automatically */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundColor: "#191818",
            backgroundImage: "url('/hero-bg.jpg')",
          }}
        />

        {/* Layer 2: Directional gradient — text side opaque, image side open */}
        <div className="absolute inset-0 bg-linear-to-r from-[#191818]/95 via-[#191818]/78 to-[#191818]/42" />

        {/* Layer 3: Ambient palette tint for atmosphere */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 15% 85%, rgba(96,75,51,0.28) 0%, transparent 52%), " +
              "radial-gradient(ellipse at 78% 18%, rgba(96,145,140,0.20) 0%, transparent 48%)",
          }}
        />

        {/* Content */}
        <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 py-28 sm:px-6 sm:py-36 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-40">
          {/* Copy */}
          <div>
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
              style={{
                border: "1px solid rgba(154,181,199,0.30)",
                backgroundColor: "rgba(154,181,199,0.10)",
                color: "#9AB5C7",
              }}
            >
              AI-powered video avatars for business
            </div>
            <h1
              className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
              style={{ color: "#ECEAE9" }}
            >
              Say it once.
              <br />
              Scale it everywhere.
            </h1>
            <p
              className="mt-6 max-w-lg text-lg leading-relaxed"
              style={{ color: "#9AB5C7" }}
            >
              YouMimic creates a professional AI avatar from a single recorded
              session. Deploy consistent, on-brand video communication across
              every language, market, and channel—without a camera crew.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {/* Primary CTA — warm brown */}
              <Button
                asChild
                className="h-11 px-6 text-sm font-medium"
                style={{
                  backgroundColor: "#604B33",
                  color: "#ECEAE9",
                  borderColor: "transparent",
                }}
              >
                <Link href="/signup">Get started free</Link>
              </Button>
              {/* Secondary CTA — cream outline */}
              <Button
                asChild
                variant="ghost"
                className="h-11 px-6 text-sm font-medium"
                style={{
                  border: "1px solid rgba(236,234,233,0.30)",
                  color: "#ECEAE9",
                }}
              >
                <Link href="/login">Sign in to portal</Link>
              </Button>
            </div>
          </div>

          {/* Product mockup — desktop only */}
          <div className="hidden lg:flex lg:justify-end">
            <ProductMockup />
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-muted py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <dl className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {stats.map(({ value, label }) => (
              <div key={label} className="text-center sm:text-left">
                <dd className="text-3xl font-semibold tracking-tight text-primary">
                  {value}
                </dd>
                <dt className="mt-1 text-sm text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="border-b border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Built for how businesses actually communicate
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Traditional video production doesn&apos;t scale. YouMimic does.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex gap-5 rounded-xl border border-border bg-card p-6"
              >
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 border border-accent/20">
                  <Icon className="size-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-muted py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-14 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              From one session to unlimited output
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Three steps from your first recording to organization-wide
              deployment.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {steps.map(({ n, icon: Icon, title, body }) => (
              <div
                key={n}
                className="relative rounded-xl border border-border bg-card p-6"
              >
                <div className="mb-5 flex items-start justify-between">
                  {/* Step badge — warm brown primary */}
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                    {n}
                  </span>
                  <Icon className="size-5 text-accent" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Avatar showcase ──────────────────────────────────────────────── */}
      <section className="border-b border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Your team, deployed at scale
            </h2>
            <p className="mt-3 max-w-md text-muted-foreground">
              Each avatar is a precision representation of a professional
              identity—ready to communicate on their behalf in any language.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {avatars.map(({ initial, name, role, status, langs }) => (
              <div
                key={name}
                className="flex items-start gap-4 rounded-xl border border-border bg-card p-5"
              >
                {/* Avatar circle — teal tint */}
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-base font-semibold text-accent">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {name}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          status === "Active"
                            ? "bg-accent" /* teal — ready/active */
                            : "bg-secondary-foreground/40" /* muted — processing */,
                        )}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{role}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {langs.map((lang) => (
                      <span
                        key={lang}
                        className="rounded border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-muted py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Where teams deploy YouMimic
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              One platform. Multiple communication surfaces.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {useCases.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 border border-accent/20">
                  <Icon className="size-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section className="border-b border-border py-20 sm:py-24">
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
            {plans.map(
              ({
                name,
                tagline,
                price,
                features: planFeatures,
                cta,
                href,
                highlight,
              }) => (
                <Card
                  key={name}
                  className={cn(
                    "flex flex-col",
                    highlight && "ring-2 ring-primary",
                  )}
                >
                  <CardHeader>
                    {highlight && (
                      <span className="mb-2 self-start rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
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
                      {planFeatures.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
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
              ),
            )}
          </div>
        </div>
      </section>

      {/* ── Final CTA — dark, matches hero palette ───────────────────────── */}
      <section
        className="relative overflow-hidden py-24 sm:py-32"
        style={{ backgroundColor: "#191818" }}
      >
        {/* Subtle ambient tint */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 80% 50%, rgba(96,145,140,0.12) 0%, transparent 60%), " +
              "radial-gradient(ellipse at 20% 80%, rgba(96,75,51,0.15) 0%, transparent 55%)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-6xl px-4 text-center sm:px-6">
          <h2
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{ color: "#ECEAE9" }}
          >
            Ready to deploy your first AI avatar?
          </h2>
          <p
            className="mx-auto mt-4 max-w-sm text-sm leading-relaxed"
            style={{ color: "#9AB5C7" }}
          >
            Join teams already using YouMimic to scale professional video
            communication without additional production overhead.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              className="h-11 px-6 text-sm font-medium"
              style={{
                backgroundColor: "#604B33",
                color: "#ECEAE9",
                borderColor: "transparent",
              }}
            >
              <Link href="/signup">Create your account</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-11 px-6 text-sm font-medium"
              style={{
                border: "1px solid rgba(236,234,233,0.25)",
                color: "#ECEAE9",
              }}
            >
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
