import type { Metadata } from "next";
import Link from "next/link";
import {
  Shield,
  Globe,
  Users,
  Radio,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DarkCtaBand } from "@/components/marketing/dark-cta-band";

export const metadata: Metadata = {
  title: "Solutions — YouMimic",
  description:
    "See how CEOs, executives, educators, creators, and digital communicators across every industry are scaling their video presence with YouMimic.",
};

// ─── Data ────────────────────────────────────────────────────────────────────

const capabilities = [
  {
    icon: Shield,
    title: "Safety & training videos",
    body: "Produce consistent, compliance-ready training and safety briefings from a single recording, distributed at scale.",
  },
  {
    icon: Globe,
    title: "175+ languages",
    body: "Deliver every message in any language without re-recording. One session, global reach.",
  },
  {
    icon: Users,
    title: "User generated content",
    body: "Let teams, customers, and partners generate on-brand video content using your avatar at scale.",
  },
  {
    icon: TrendingUp,
    title: "Investor pitches & market reports",
    body: "Present data, strategy, and forecasts with a polished, professional delivery, every time, without studio time.",
  },
  {
    icon: Radio,
    title: "Team & service announcements",
    body: "Replace written memos with consistent video messages from leadership, delivered to every team member instantly.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SolutionsPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-muted py-20 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 90% 10%, rgba(76,153,151,0.14) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="max-w-2xl">
            <div
              className="mb-6 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              style={{
                border: "1px solid rgba(76,153,151,0.30)",
                backgroundColor: "rgba(76,153,151,0.08)",
                color: "#4C9997",
              }}
            >
              Solutions
            </div>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
              How our clients are using their <span style={{ color: "#4C9997" }}>avatars</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              CEOs, executives, educators, creators, and digital communicators
              are scaling their video presence with YouMimic: one recorded
              session, unlimited deployment.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-11 px-6 text-sm font-medium">
                <Link href="/contact#book-demo">Book a Demo</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 px-6 text-sm font-medium"
              >
                <Link href="/pricing">See Pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── What you can create ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border py-20 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 8% 90%, rgba(76,153,151,0.12) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tighter text-foreground sm:text-4xl">
              What you can create
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              One avatar. Unlimited video output. Across every format your
              business needs.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex gap-5 rounded-xl bg-card p-6 shadow-[0_1px_2px_rgba(51,51,51,0.06),0_8px_16px_-4px_rgba(51,51,51,0.10),0_20px_32px_-8px_rgba(76,153,151,0.12)] transition-all duration-300 hover:-translate-y-1"
              >
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
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

      <DarkCtaBand
        heading="Ready to talk about your video messaging?"
        body="Talk to our team about how YouMimic can work for your industry, team size, and communication goals."
        primaryHref="/contact#book-demo"
        primaryLabel="Book a Demo"
        secondaryHref="/pricing"
        secondaryLabel="See Pricing"
      />
    </>
  );
}
