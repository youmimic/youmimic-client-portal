import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import {
  Zap,
  Building2,
  Megaphone,
  BookOpen,
  Video,
  Cpu,
  Share2,
  Landmark,
  MapPin,
  BarChart3,
  Rocket,
  ShoppingBag,
  ShoppingCart,
  Heart,
  Clock,
  Maximize2,
  PiggyBank,
  Infinity as InfinityIcon,
  Languages,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { NewsletterForm } from "@/components/marketing/newsletter-form";

export const metadata: Metadata = {
  title: "Pricing — YouMimic",
  description:
    "Simple, transparent pricing for individuals, enterprises, and custom deployments.",
};

const whyYouMimic = [
  {
    icon: Clock,
    title: "Save Time",
    body: "From concept to completion, have your content produced in a fraction of the time.",
  },
  {
    icon: Maximize2,
    title: "Scale Content",
    body: "One piece of video content can be exponentially scaled. Templates can be created for speed and consistency.",
  },
  {
    icon: PiggyBank,
    title: "Reduce Costs",
    body: "Unlimited videos without the need to film again, saving thousands of dollars compared to traditional methods.",
  },
  {
    icon: InfinityIcon,
    title: "24/7 Availability",
    body: "Platform access, your avatar is available anytime, anywhere, for responsive updates.",
  },
  {
    icon: Languages,
    title: "Speak Any Language",
    body: "Up to 175 different languages and dialects available.",
  },
  {
    icon: ShieldCheck,
    title: "End to End Data Encryption",
    body: "Your avatar is encrypted at rest and in transit, ensuring it only says what you've approved, and only those you authorize can access it.",
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

// Moved here from /solutions per the client's fix list (item 10a) — sits
// right after "Not sure which plan fits your business?" on this page now.
// Each industry's use cases are listed as short bullet items (item 10c)
// rather than a single comma-heavy sentence.
const industries = [
  {
    icon: Landmark,
    name: "Government",
    items: [
      "Policy updates",
      "Public health announcements",
      "Staff training in multiple languages",
    ],
  },
  {
    icon: Zap,
    name: "Energy, Mining & Utilities",
    items: [
      "Safety briefings",
      "Compliance training",
      "Operational updates for field teams",
    ],
  },
  {
    icon: Megaphone,
    name: "Advertising Agencies",
    items: ["Campaign assets", "Localized ads", "Product walkthroughs"],
  },
  {
    icon: MapPin,
    name: "Tourism & Events",
    items: [
      "Destination guides",
      "Event previews",
      "Multilingual welcome messages",
    ],
  },
  {
    icon: BarChart3,
    name: "Finance & Insurance",
    items: ["Product explainers", "Regulatory updates", "Portfolio summaries"],
  },
  {
    icon: Rocket,
    name: "Entrepreneurs & Startups",
    items: ["Investor pitches", "Product demos", "Launch announcements"],
  },
  {
    icon: ShoppingBag,
    name: "Small Business",
    items: ["Promotions", "How-to guides", "Service updates"],
  },
  {
    icon: Building2,
    name: "Corporate",
    items: [
      "Internal communications",
      "Leadership messages",
      "HR announcements",
    ],
  },
  {
    icon: BookOpen,
    name: "Education & Training",
    items: ["Course content", "Professional development material"],
  },
  {
    icon: ShoppingCart,
    name: "Retail & e-Commerce",
    items: [
      "Product demonstrations",
      "Seasonal campaigns",
      "Customer onboarding videos",
    ],
  },
  {
    icon: Heart,
    name: "Health & Aged Care",
    items: ["Care protocols", "Patient education", "Staff training"],
  },
  {
    icon: Cpu,
    name: "Technology, Science & Medicine",
    items: [
      "Research summaries",
      "Product documentation",
      "Technical training",
    ],
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
      An active subscription is required to access that feature. Choose a plan
      below to continue.
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
                Choose a plan for your business
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
                YouMimic turns a single recording session into a professional AI
                avatar that speaks for you in any language, whenever you need
                it.
              </p>
              <p
                className="mt-4 text-lg leading-relaxed sm:text-xl"
                style={{ color: "rgba(51,51,51,0.7)" }}
              >
                No camera crew, no reshoots, no waiting around for your next
                video. Write a script, and your avatar takes it from there.
              </p>
            </div>
          </div>
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
                Book a quick meeting and we&apos;ll help you find the right one.
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
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-muted py-24 sm:py-32">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 95% 95%, rgba(76,153,151,0.13) 0%, transparent 48%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
              Built for <span style={{ color: "#4C9997" }}>every industry</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              You Mimic is saving time for our Government and Private sector
              clients.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map(({ icon: Icon, name, items }) => (
              <div
                key={name}
                className="rounded-xl bg-card p-6 shadow-[0_1px_2px_rgba(51,51,51,0.06),0_8px_16px_-4px_rgba(51,51,51,0.10),0_20px_32px_-8px_rgba(76,153,151,0.12)] transition-all duration-300 hover:-translate-y-1"
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
                  <Icon className="size-5 text-accent" />
                </div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  {name}
                </h3>
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
                    >
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
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
              Why <span style={{ color: "#4C9997" }}>You Mimic</span>?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              How an AI digital twin can help your business grow.
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-2">
            {whyYouMimic.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-5">
                <div
                  className="flex size-14 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "#4C9997" }}
                >
                  <Icon className="size-6" style={{ color: "#FFFFFF" }} />
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

      {/* Stay Connected banner — item 13 on the client's fix list. Mirrors
          the footer's social/newsletter block, placed on this page before
          the FinalCtaSection hands off to the real site footer. */}
      <section
        className="py-16 sm:py-20"
        style={{ backgroundColor: "#333333" }}
      >
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mx-auto max-w-md text-center">
            <h2
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{ color: "#FFFFFF" }}
            >
              Stay Connected
            </h2>
            <div className="mt-6 text-left">
              <NewsletterForm />
            </div>
          </div>
        </div>
      </section>

      <FinalCtaSection isLoggedIn={isLoggedIn} />
    </>
  );
}
