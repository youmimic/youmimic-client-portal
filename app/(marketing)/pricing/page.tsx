import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
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
  MessageCircle,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";

export const metadata: Metadata = {
  title: "Pricing — YouMimic",
  description:
    "Simple, transparent pricing for individuals, enterprises, and custom deployments.",
};

const stats = [
  { value: "3 min", label: "Average generation time" },
  { value: "175+", label: "Supported languages" },
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
    body: "Say it once and it comes out in any language you need, no re-recording, no translators.",
  },
  {
    icon: Building2,
    title: "Built-in oversight",
    body: "Control who can do what, keep your brand consistent, and see what's been made. Everything stays in order.",
  },
];

const modules = [
  {
    icon: MessageCircle,
    title: "Speak",
    body: "Conversation courses your avatar can lead: practice, roleplay, and everyday dialogue, in any language.",
  },
  {
    icon: BookOpen,
    title: "Read",
    body: "Reading courses that turn written material into spoken video lessons, ready to watch or listen to.",
  },
  {
    icon: PenLine,
    title: "Write",
    body: "Writing courses delivered as video walkthroughs, clear guidance without a wall of text.",
  },
];

const steps = [
  {
    n: "01",
    icon: Video,
    title: "Record your session",
    body: "Attend a short, guided recording session. We capture your likeness, voice, and professional presence, once.",
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
    body: "Give every team the same clear onboarding, compliance training, and skill-building, wherever they are.",
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
    body: "Replace written memos with professional video messages from leadership, without booking a camera crew.",
  },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const isGated = reason === "subscription-required";
  const session = await auth();
  const isLoggedIn = Boolean(session?.user);

  const banner = isGated ? (
    <div className="mb-10 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      An active subscription is required to access that feature. Choose a
      plan below to continue.
    </div>
  ) : null;

  return (
    <>
      <section
        className="py-10 sm:py-16"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-0">
          <div className="relative mx-auto aspect-21/9 w-full overflow-hidden rounded-[2rem] shadow-lg sm:rounded-[2.5rem] lg:aspect-auto lg:h-[60vh] lg:w-[90vw]">
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundColor: "#333333",
                backgroundImage: "url('/hero-bg.avif')",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(51,51,51,0.35) 0%, rgba(51,51,51,0.35) 100%)",
              }}
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at 15% 85%, rgba(76,153,151,0.28) 0%, transparent 52%), " +
                  "radial-gradient(ellipse at 78% 18%, rgba(76,153,151,0.20) 0%, transparent 48%)",
              }}
            />
          </div>
        </div>

        <div className="mx-auto mt-8 w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="text-center lg:text-left">
              <h1
                className="text-5xl font-bold leading-[1.05] tracking-tighter sm:text-6xl lg:text-7xl"
                style={{ color: "#333333" }}
              >
                Say it once.
                <br />
                Scale it everywhere.
              </h1>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
                <Button
                  asChild
                  className="h-12 px-8 text-base font-medium"
                  style={{
                    backgroundColor: "#4C9997",
                    color: "#FFFFFF",
                    borderColor: "#4C9997",
                  }}
                >
                  <a href="#pricing">See Pricing</a>
                </Button>
              </div>
            </div>

            <div className="text-center lg:text-left">
              <p
                className="text-lg leading-relaxed sm:text-xl"
                style={{ color: "rgba(51,51,51,0.7)" }}
              >
                YouMimic turns a single recording session into a
                professional AI avatar that speaks for you in any
                language, whenever you need it.
              </p>
              <p
                className="mt-4 text-lg leading-relaxed sm:text-xl"
                style={{ color: "rgba(51,51,51,0.7)" }}
              >
                No camera crew, no reshoots, no waiting around for your
                next video. Write a script, and your avatar takes it from
                there.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28" style={{ backgroundColor: "#333333" }}>
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <dl className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            {stats.map(({ value, label }) => (
              <div key={label} className="text-center">
                <dd
                  className="text-6xl font-bold tracking-tighter sm:text-7xl"
                  style={{ color: "#4C9997" }}
                >
                  {value}
                </dd>
                <dt
                  className="mt-3 text-sm"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  {label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <PricingSection id="pricing" banner={banner} isLoggedIn={isLoggedIn} />

      <section className="bg-muted py-24 sm:py-32">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="text-center lg:text-left">
              <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
                Not sure which plan fits your business?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground lg:mx-0">
                Book a quick meeting and we&apos;ll help you find the right
                one.
              </p>
              <div className="mt-8 flex justify-center lg:justify-start">
                <Button asChild className="h-12 px-8 text-base font-medium">
                  <Link href="/contact#book-demo">Book a Meeting</Link>
                </Button>
              </div>
            </div>

            <div className="mx-auto w-full max-w-2xl">
              <div className="overflow-hidden rounded-[2rem] shadow-lg">
                <video
                  className="block w-full transition-transform duration-300 ease-out hover:scale-105"
                  src="/book-meeting.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3">
                {modules.map(({ icon: Icon, title, body }) => (
                  <div
                    key={title}
                    className="rounded-xl bg-card p-3 text-center"
                    style={{ border: "1px solid #FFFFFF" }}
                  >
                    <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-accent/10">
                      <Icon className="size-5 text-accent" />
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-foreground">
                      {title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 sm:py-32">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 90% 20%, rgba(76,153,151,0.12) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
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

      <section className="bg-muted py-24 sm:py-32">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
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
                  <span className="text-5xl font-bold tracking-tighter text-primary">
                    {n}
                  </span>
                  <Icon className="size-6 text-accent" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">
                  {title}
                </h3>
                <p className="leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 sm:py-32">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 10% 100%, rgba(76,153,151,0.10) 0%, transparent 45%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
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

      <FinalCtaSection isLoggedIn={isLoggedIn} />
    </>
  );
}
