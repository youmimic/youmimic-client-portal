import type { Metadata } from "next";
import Link from "next/link";
import {
  Landmark,
  Zap,
  Megaphone,
  MapPin,
  BarChart3,
  Rocket,
  ShoppingBag,
  Building2,
  BookOpen,
  ShoppingCart,
  Heart,
  Cpu,
  Video,
  Shield,
  Globe,
  Users,
  Radio,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
    body: "Produce consistent, compliance-ready training and safety briefings from a single recording — distributed at scale.",
  },
  {
    icon: Globe,
    title: "175+ languages",
    body: "Deliver every message in any language without re-recording. One session, global reach.",
  },
  {
    icon: Users,
    title: "User generated content",
    body: "Empower teams, customers, and partners to generate on-brand video content using your avatar at scale.",
  },
  {
    icon: TrendingUp,
    title: "Investor pitches & market reports",
    body: "Present data, strategy, and forecasts with a polished, professional delivery — every time, without studio time.",
  },
  {
    icon: Radio,
    title: "Team & service announcements",
    body: "Replace written memos with consistent video messages from leadership, delivered to every team member instantly.",
  },
];

const industries = [
  {
    icon: Landmark,
    name: "Government",
    body: "Deliver policy updates, public health announcements, and staff training in multiple languages without re-filming.",
  },
  {
    icon: Zap,
    name: "Energy, Mining & Utilities",
    body: "Produce consistent safety briefings, compliance training, and operational updates for distributed field teams.",
  },
  {
    icon: Megaphone,
    name: "Advertising Agencies",
    body: "Equip clients with always-on presenter avatars for campaign assets, localized ads, and product walkthroughs.",
  },
  {
    icon: MapPin,
    name: "Tourism & Events",
    body: "Create destination guides, event previews, and multilingual welcome messages that reach global audiences.",
  },
  {
    icon: BarChart3,
    name: "Finance & Insurance",
    body: "Communicate complex products, regulatory updates, and portfolio summaries at scale with consistent brand representation.",
  },
  {
    icon: Rocket,
    name: "Entrepreneurs & Startups",
    body: "Build a professional video presence from day one — investor pitches, product demos, and launch announcements without a production budget.",
  },
  {
    icon: ShoppingBag,
    name: "Small Business",
    body: "Produce polished customer-facing videos — promotions, how-to guides, and service updates — with the presence of a much larger team.",
  },
  {
    icon: Building2,
    name: "Corporate",
    body: "Scale internal communications, leadership messages, and HR announcements across global departments without scheduling camera time.",
  },
  {
    icon: BookOpen,
    name: "Education & Training",
    body: "Deliver consistent, engaging course content and professional development material to learners anywhere, in their language.",
  },
  {
    icon: ShoppingCart,
    name: "Retail & e-Commerce",
    body: "Create product demonstrations, seasonal campaigns, and customer onboarding videos that keep pace with inventory and promotions.",
  },
  {
    icon: Heart,
    name: "Health & Aged Care",
    body: "Communicate care protocols, patient education, and staff training with clarity and empathy, across multiple languages and facilities.",
  },
  {
    icon: Cpu,
    name: "Technology, Science & Medicine",
    body: "Translate complex research, product documentation, and technical training into clear, accessible video content for any audience.",
  },
  {
    icon: Video,
    name: "Creators",
    body: "Expand your reach beyond your native language. Generate content in 175+ languages from a single recording and grow your global audience.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SolutionsPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-muted py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <div
              className="mb-6 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              style={{
                border: "1px solid rgba(96,145,140,0.30)",
                backgroundColor: "rgba(96,145,140,0.08)",
                color: "#60918C",
              }}
            >
              Solutions
            </div>
            <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-5xl">
              How our clients are using their avatars
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              CEOs, executives, educators, creators, and digital communicators
              are scaling their video presence with YouMimic — one recorded
              session, unlimited deployment.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-11 px-6 text-sm font-medium">
                <Link href="/contact">Book a demo</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 px-6 text-sm font-medium"
              >
                <Link href="/pricing">View pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── What you can create ──────────────────────────────────────────── */}
      <section className="border-b border-border py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
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
                className="flex gap-5 rounded-xl border border-border bg-card p-6"
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

      {/* ── Industries ───────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-muted py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Built for every industry
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              From government to retail, YouMimic is already helping teams
              across 13 sectors scale their video communication.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map(({ icon: Icon, name, body }) => (
              <div
                key={name}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
                  <Icon className="size-5 text-accent" />
                </div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  {name}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA — dark, matches homepage palette ───────────────────── */}
      <section
        className="relative overflow-hidden py-24 sm:py-32"
        style={{ backgroundColor: "#191818" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
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
            Ready to elevate your video messaging?
          </h2>
          <p
            className="mx-auto mt-4 max-w-sm text-sm leading-relaxed"
            style={{ color: "#9AB5C7" }}
          >
            Talk to our team about how YouMimic can work for your industry,
            team size, and communication goals.
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
              <Link href="/contact">Book a demo</Link>
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
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
