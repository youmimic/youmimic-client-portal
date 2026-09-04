import type { Metadata } from "next";
import Link from "next/link";
import {
  Share2,
  FileText,
  MessageSquare,
  Globe,
  TrendingUp,
  Mail,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Small Business Solutions — YouMimic",
  description:
    "AI avatar video for small businesses — social content, proposals, outreach, and sales, without a production team.",
};

const offerings = [
  {
    n: "01",
    icon: Share2,
    title: "Social Media",
    body: "Turn a single script into a week of on-brand social video — no camera, no editor, no reshoots when the message changes.",
  },
  {
    n: "02",
    icon: FileText,
    title: "Project Proposals",
    body: "Open every pitch with a personal video from your avatar instead of a static deck, without booking studio time for each client.",
  },
  {
    n: "03",
    icon: MessageSquare,
    title: "Personalised Outreach",
    body: "Send prospects and leads a video that uses their name and context — recorded once, personalized at scale.",
  },
  {
    n: "04",
    icon: Globe,
    title: "Language",
    body: "Reach customers in their own language from a single English recording, without hiring a translator or re-filming.",
  },
  {
    n: "05",
    icon: TrendingUp,
    title: "Sales",
    body: "Equip every rep with consistent, on-brand video for demos and follow-ups — the same polish regardless of who's presenting.",
  },
  {
    n: "06",
    icon: Mail,
    title: "Newsletters",
    body: "Add a short video update to your regular newsletter without a weekly production cycle behind it.",
  },
];

const stats = [
  { value: "2", label: "Avatars to get started" },
  { value: "3 min", label: "Average generation time" },
  { value: "12+", label: "Supported languages" },
  { value: "899", label: "Starting price, $/mo" },
];

export default function SmallBusinessSolutionsPage() {
  return (
    <>
      <section className="border-b border-border bg-muted py-20 sm:py-28">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-medium text-accent">Solutions / Small Business</p>
            <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-5xl">
              Small Business Solutions
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              A professional video presence, without a production team. Record
              once, and your avatar handles social content, proposals,
              outreach, and sales communication from there.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-11 px-6 text-sm font-medium">
                <Link href="/contact#book-demo">Book Now</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 px-6 text-sm font-medium">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Six service offerings ────────────────────────────────────── */}
      <section className="border-b border-border py-20 sm:py-24">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              What your avatar can do
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Six ways small businesses put YouMimic to work, day to day.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {offerings.map(({ n, icon: Icon, title, body }) => (
              <div key={title} className="relative rounded-xl border border-border bg-card p-6">
                <div className="mb-5 flex items-start justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                    {n}
                  </span>
                  <Icon className="size-5 text-accent" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Growth stats ─────────────────────────────────────────────── */}
      <section className="border-b border-border bg-muted py-16">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <h2 className="mb-10 text-center text-xl font-semibold tracking-tight text-foreground">
            Built for how small businesses actually run
          </h2>
          <dl className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {stats.map(({ value, label }) => (
              <div key={label} className="text-center">
                <dd className="text-3xl font-semibold tracking-tight text-primary">{value}</dd>
                <dt className="mt-1 text-sm text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Use-case scenario — an illustrative example, not an attributed
          quote from a named customer (no real published testimonial exists
          yet to publish here). ─────────────────────────────────────────── */}
      <section className="border-b border-border py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Quote className="mx-auto mb-6 size-8 text-accent" />
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            A typical small-business setup
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            A two-person consultancy records one session for its founder, then
            uses that avatar for weekly LinkedIn updates, personalised
            proposal intros, and follow-up videos for warm leads — all
            without booking a camera crew or re-recording when the offer
            changes.
          </p>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 sm:py-32" style={{ backgroundColor: "#333333" }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% 50%, rgba(76,153,151,0.12) 0%, transparent 60%), " +
              "radial-gradient(ellipse at 20% 80%, rgba(76,153,151,0.15) 0%, transparent 55%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 text-center sm:px-6 lg:w-[90vw] lg:px-0">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "#FFFFFF" }}>
            Ready to get started?
          </h2>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
            Small Business plans start at $499/mo. Book a demo and see your
            avatar in action.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              className="h-11 px-6 text-sm font-medium"
              style={{ backgroundColor: "#4C9997", color: "#FFFFFF", borderColor: "transparent" }}
            >
              <Link href="/contact#book-demo">Book Now</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-11 px-6 text-sm font-medium"
              style={{ border: "1px solid rgba(255,255,255,0.25)", color: "#FFFFFF" }}
            >
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
