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
  Video,
  Cpu,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingPlans } from "@/components/marketing/pricing-plans";

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
    title: "Ready right away",
    body: "Record one session and get professional video straight away. No reshoots, no scheduling, no waiting around.",
  },
  {
    icon: Layers,
    title: "As many videos as you need",
    body: "Your avatar can make videos all day, every day. One person's time, felt by your whole team.",
  },
  {
    icon: Globe,
    title: "Speaks every language",
    body: "Say it once and it comes out in any language you need—no re-recording, no translators.",
  },
  {
    icon: Building2,
    title: "Built-in oversight",
    body: "Control who can do what, keep your brand consistent, and see what's been made. Everything stays in order.",
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
    title: "Generate and share",
    body: "Type or paste your script. Your avatar turns it into a polished, on-brand video ready to send anywhere.",
  },
];

const useCases = [
  {
    icon: Users,
    title: "Employee training",
    body: "Give every team the same clear onboarding, compliance training, and skill-building — wherever they are.",
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


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      {/* ── Hero — Starlink-style: full-viewport, single centered column,
          oversized type, minimal copy, one CTA. Same colors/background
          layers as before (dark #333333, teal ambient tint) — structure
          and copy length changed, not the palette or font. ──────────── */}
      <section className="relative flex min-h-screen items-center overflow-hidden">
        {/* Layer 1: Background — charcoal fallback; /public/hero-bg.jpg activates automatically */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundColor: "#333333",
            backgroundImage: "url('/hero-bg.jpg')",
          }}
        />

        {/* Layer 2: Vignette — edges darker, center clearer, for a more
            cinematic full-bleed feel than the old left-to-right gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(51,51,51,0.55) 0%, rgba(51,51,51,0.92) 100%)",
          }}
        />

        {/* Layer 3: Ambient palette tint for atmosphere */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 15% 85%, rgba(76,153,151,0.28) 0%, transparent 52%), " +
              "radial-gradient(ellipse at 78% 18%, rgba(76,153,151,0.20) 0%, transparent 48%)",
          }}
        />

        {/* Content — single centered column, no badge, no mockup, one CTA */}
        <div className="relative z-10 mx-auto max-w-4xl px-4 py-28 text-center sm:px-6">
          <h1
            className="text-6xl font-semibold leading-[1.02] tracking-tight sm:text-7xl lg:text-8xl"
            style={{ color: "#FFFFFF" }}
          >
            Say it once.
            <br />
            Scale it everywhere.
          </h1>
          <p
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed sm:text-xl"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            One AI avatar. Every language, every channel.
          </p>
          <div className="mt-10 flex justify-center">
            <Button
              asChild
              className="h-12 px-8 text-base font-medium"
              style={{
                backgroundColor: "#4C9997",
                color: "#FFFFFF",
                borderColor: "transparent",
              }}
            >
              <Link href="/signup">Get started free</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="bg-muted py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <dl className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            {stats.map(({ value, label }) => (
              <div key={label} className="text-center">
                <dd className="text-5xl font-semibold tracking-tight text-primary sm:text-6xl">
                  {value}
                </dd>
                <dt className="mt-2 text-sm text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Made for how you actually communicate
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              Old-school video takes too long. YouMimic doesn&apos;t.
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-5">
                <div className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                  <Icon className="size-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="bg-muted py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              One session. Unlimited output.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              Three steps to get your whole team going.
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-3">
            {steps.map(({ n, icon: Icon, title, body }) => (
              <div key={n} className="relative">
                <div className="mb-6 flex items-center justify-between">
                  {/* Step number — teal primary */}
                  <span className="text-5xl font-semibold tracking-tight text-primary">
                    {n}
                  </span>
                  <Icon className="size-6 text-accent" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">
                  {title}
                </h3>
                <p className="leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────────────────────────── */}
      <section className="bg-muted py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Where teams use YouMimic
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              One platform. Every way you communicate.
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-2">
            {useCases.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-5">
                <div className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                  <Icon className="size-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Transparent, flexible pricing
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              Start with one avatar. Add more as you grow.
            </p>
          </div>
          <PricingPlans />
        </div>
      </section>

      {/* ── Book a demo ──────────────────────────────────────────────────── */}
      <section className="bg-muted py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Not sure which plan fits your business?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
            Book a quick meeting and we&apos;ll help you find the right one.
          </p>
          <Button asChild className="mt-8 h-12 px-8 text-base font-medium">
            <Link href="/contact#book-demo">Book a Meeting</Link>
          </Button>
        </div>
      </section>

      {/* ── Final CTA — dark, matches hero palette ───────────────────────── */}
      <section
        className="relative overflow-hidden py-32 sm:py-40"
        style={{ backgroundColor: "#333333" }}
      >
        {/* Subtle ambient tint */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 80% 50%, rgba(76,153,151,0.12) 0%, transparent 60%), " +
              "radial-gradient(ellipse at 20% 80%, rgba(76,153,151,0.15) 0%, transparent 55%)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-6xl px-4 text-center sm:px-6">
          <h2
            className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
            style={{ color: "#FFFFFF" }}
          >
            Ready to create your first AI avatar?
          </h2>
          <p
            className="mx-auto mt-5 max-w-sm text-lg leading-relaxed"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            Make professional videos without a production crew.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              className="h-12 px-8 text-base font-medium"
              style={{
                backgroundColor: "#4C9997",
                color: "#FFFFFF",
                borderColor: "transparent",
              }}
            >
              <Link href="/signup">Create your account</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-12 px-8 text-base font-medium"
              style={{
                border: "1px solid rgba(255,255,255,0.25)",
                color: "#FFFFFF",
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
