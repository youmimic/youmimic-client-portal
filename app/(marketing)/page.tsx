import Link from "next/link";
import NextImage from "next/image";
import { auth } from "@/auth";
import {
  Fingerprint,
  Calendar,
  Cpu,
  Rocket,
  Quote,
  UserSquare2,
  Bot,
  Presentation,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/marketing/pricing-section";
import { HowItLooksVideo } from "@/components/marketing/how-it-looks-video";

const stats = [
  { value: "175+", label: "Languages supported" },
  { value: "4K", label: "Output quality" },
  { value: "10", label: "Staff captured per day" },
  { value: "30 min", label: "Capture time per person" },
];

const howItWorks = [
  {
    n: "01",
    icon: Calendar,
    title: "Book Your Session",
    body: "Choose your plan and we'll come to you — our team travels anywhere in Australia. Each capture takes about 30 minutes per person, with up to 10 staff captured in a single day.",
  },
  {
    n: "02",
    icon: Cpu,
    title: "Your Avatar Setup",
    body: "We create and train your avatar from the capture. No technical setup required from your team.",
  },
  {
    n: "03",
    icon: Rocket,
    title: "Your Avatar Is Ready",
    body: "We deploy your avatar and give you access to our platform. Your team can create business content on demand in over 175 languages.",
  },
];

const testimonials = [
  {
    quote:
      "You Mimic AI are amazing! From capture session to onboarding and support. The quality of my avatar is mind blowing!",
    name: "Patrick Lang",
    title: "Realtor, Belle Property Australia",
  },
  {
    quote:
      "You Mimic AI is a truly forward-thinking partner for us. Hyper-realistic avatars that power our Sales Kick-offs, Town Halls and Customer Presentations. It saves us time.",
    name: "Joel Starkey",
    title: "Sales Enablement, DXC Technology",
  },
  {
    quote:
      "You Mimic AI are the gold standard in avatar captures and set the benchmark for quality, ethics and responsible AI.",
    name: "Dr. Catherine Ball",
    title: "Corporate Speaker, Xprize Board Member",
  },
];

const services = [
  {
    icon: UserSquare2,
    title: "Digital Twins",
    image: "/digital-twins.avif",
    body: "Photorealistic digital twins of your people — from executives and subject-matter experts to entire teams. Generate training, sales, internal communications, and customer content on demand.",
  },
  {
    icon: Bot,
    title: "Interactive Avatars",
    image: "/interactive avatars.avif",
    body: "Turn your digital twins into interactive AI employees, trained on your approved business knowledge. They can answer questions, onboard staff, support customers, and deliver information around the clock in most languages.",
  },
  {
    icon: Presentation,
    title: "Holograms",
    image: "/holograms.avif",
    body: "Life-size digital presenters for malls, airports, terminals, retail, and events — delivering branded content, advertising, and customer engagement.",
  },
];

// Every file in the "Where you've seen us / Featured At" folder — skipping
// blob.png, which is a duplicate of images.jpg's Australian Computer
// Society mark (icon-only vs. icon+wordmark) rather than a distinct logo.
const featuredAt = [
  { name: "SXSW Sydney", src: "/Where you've seen us/Featured At/SXSW_Sydney_2023_Hero.jpg" },
  { name: "TEDx Hobart", src: "/Where you've seen us/Featured At/tedxHobart.png" },
  {
    name: "Tasmanian Business Conference",
    src: "/Where you've seen us/Featured At/Tasmanian-Business-Conference---Logo.svg",
  },
  { name: "Rotary Australia", src: "/Where you've seen us/Featured At/Rotary Australia.jpg" },
  {
    name: "Governance Institute of Australia",
    src: "/Where you've seen us/Featured At/Govenerae Instiatute of Australia.jpg",
  },
  { name: "Australian Computer Society", src: "/Where you've seen us/Featured At/images.jpg" },
  { name: "EdCAT 2026", src: "/Where you've seen us/Featured At/edcat.jpg" },
];

// Every file in the Client Logos folder — matched to its actual company
// name rather than the raw (often auto-generated) filename. `dark` flips a
// card to a dark chip for the one asset that's white ink on transparent
// (needs a dark surface to be visible); everything else already carries
// its own background or reads fine on white.
const clientLogos = [
  { name: "4Front", src: "/Client Logos/13224_4Front logo hi-res.jpg" },
  { name: "Adam Spencer", src: "/Client Logos/Adam Spencer - Corporate Speaker.jpg" },
  {
    name: "Dr. Catherine Ball",
    src: "/Client Logos/Ball Dr Catherine PHD Logo - White_ 72dp.avif",
    dark: true,
  },
  { name: "Belle Property Australia", src: "/Client Logos/Bell Property.png" },
  { name: "CSA", src: "/Client Logos/CSA-Logo-Transparent.png" },
  { name: "Concinnity", src: "/Client Logos/Concinnity_45@4x.webp" },
  {
    name: "DXC Technology",
    src: "/Client Logos/DXC-Veritcal-Tagline-Full-Color-Dark.png",
  },
  { name: "Esri Australia", src: "/Client Logos/Esri_Australia_Logo.png" },
  {
    name: "Sporting Shooters Association of Australia",
    src: "/Client Logos/Screenshot 2026-09-03 at 3.44.28 pm.png",
  },
  {
    name: "Devonport Chamber of Commerce & Industry",
    src: "/Client Logos/Screenshot 2026-09-03 at 3.49.49 pm.png",
  },
  { name: "APM", src: "/Client Logos/apm-logo-126.png" },
  { name: "ette Sydney", src: "/Client Logos/ette+Logo+Yellow.webp" },
  {
    name: "Client logo",
    src: "/Client Logos/i5V58GCaGh_2jatit.avif",
  },
  { name: "Course Rebel", src: "/Client Logos/images.jpg" },
  { name: "BNAA", src: "/Client Logos/images.png" },
  {
    name: "Tasmanian Leaders",
    src: "/Client Logos/LUGYk0kR6WG8YWLNG1SA@seo-500.jpg",
  },
  {
    name: "TasICT",
    src: "/Client Logos/Logo-TasICT-Horizontal-JPG-1024x318.jpg",
  },
  {
    name: "CPT Engineering & Surveying",
    src: "/Client Logos/mie-case-study-cpt.jpg.webp",
  },
];

export default async function HomePage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user);
  const getStartedHref = isLoggedIn ? "/dashboard" : "/signup";

  return (
    <>
      <section
        className="py-10 sm:py-16"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-0">
          <div className="relative mx-auto h-[70vh] w-full overflow-hidden rounded-[2rem] shadow-lg sm:h-[75vh] sm:rounded-[2.5rem] lg:h-[80vh] lg:w-[90vw]">
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundColor: "#333333",
                backgroundImage: "url('/hero-bg-new.avif')",
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
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.35) 35%, transparent 65%)",
              }}
            />

            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 lg:p-14">
              <h1
                className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
                style={{ color: "#FFFFFF" }}
              >
                The future of business communication.
              </h1>
              <p
                className="mt-4 max-w-xl text-base leading-relaxed sm:text-lg lg:text-xl"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                One capture becomes infinite communication — an AI avatar
                that speaks, looks, and sounds exactly like you.
              </p>
              <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Button
                  asChild
                  className="h-12 px-8 text-base font-medium"
                  style={{
                    backgroundColor: "#4C9997",
                    color: "#FFFFFF",
                    borderColor: "transparent",
                  }}
                >
                  <Link href={getStartedHref}>Get Started</Link>
                </Button>
                <Link
                  href="/contact#book-demo"
                  className="text-sm font-medium underline-offset-4 hover:underline"
                  style={{ color: "#FFFFFF" }}
                >
                  Contact Sales
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-32">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="text-center lg:text-left">
              <div
                className="mb-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  border: "1px solid rgba(76,153,151,0.30)",
                  backgroundColor: "rgba(76,153,151,0.08)",
                  color: "#4C9997",
                }}
              >
                <Fingerprint className="size-3.5" />
                Built for business
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                We create your digital twin.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
                One capture. Infinite communication. It speaks, looks, and
                sounds exactly like you — training teams, updating clients,
                and pitching investors in 175+ languages, at 4K quality,
                anywhere, anytime.
              </p>
              <div className="mt-8 flex justify-center lg:justify-start">
                <Button asChild variant="outline" className="h-11 px-6 text-sm font-medium">
                  <Link href="/solutions">Learn More</Link>
                </Button>
              </div>
            </div>

            <div
              className="aspect-21/9 w-full overflow-hidden rounded-xl bg-cover bg-center shadow-lg"
              style={{ backgroundImage: "url('/digital-twin-photo.avif')" }}
            />
          </div>
        </div>
      </section>

      <section className="bg-muted py-16 sm:py-20">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
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

      <PricingSection id="pricing" />

      <section className="bg-muted py-24 sm:py-32">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              How It Works
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              We create a photorealistic digital twin of your staff.
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-3">
            {howItWorks.map(({ n, icon: Icon, title, body }) => (
              <div key={n} className="relative">
                <div className="mb-6 flex items-center justify-between">
                  <span className="text-5xl font-semibold tracking-tight text-primary">
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
          <div className="mt-12 flex justify-center">
            <Button asChild className="h-12 px-8 text-base font-medium">
              <Link href={getStartedHref}>Get Started</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full px-4 text-center sm:px-6 lg:w-[90vw] lg:px-0">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            How It Looks
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            We create a photorealistic digital twin of your team, capable of
            producing 4K-quality video content from a simple text prompt —
            no camera, no studio, no reshoots.
          </p>
          <HowItLooksVideo
            src="/how-it-looks.mp4"
            className="mx-auto mt-8 aspect-video w-full max-w-5xl"
          />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {["Photorealistic", "4K output", "Text-to-video"].map((tag) => (
              <span
                key={tag}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  border: "1px solid rgba(76,153,151,0.30)",
                  backgroundColor: "rgba(76,153,151,0.08)",
                  color: "#4C9997",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted py-24 sm:py-32">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Trusted by Our Clients
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              Real feedback from the teams already using their digital
              twins.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {testimonials.map(({ quote, name, title }) => (
              <div
                key={name}
                className="flex flex-col rounded-xl border border-border bg-card p-6"
              >
                <Quote className="size-6 text-accent" />
                <p className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                  {quote}
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted">
                    <User className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">{title}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full px-4 text-center sm:px-6 lg:w-[90vw] lg:px-0">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Trusted by teams at
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {clientLogos.map(({ name, src, dark }) => (
              <div
                key={src}
                className="relative flex h-20 items-center justify-center rounded-xl border border-border p-4"
                style={{ backgroundColor: dark ? "#333333" : "#FFFFFF" }}
              >
                <NextImage
                  src={src}
                  alt={name}
                  fill
                  sizes="(min-width: 640px) 20vw, 50vw"
                  className="object-contain p-2"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-32">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Our Services
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
              We capture your digital twin at your office, train it, and
              deploy it. Your team can then create 4K content from a simple
              text prompt, in almost any language, on demand.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {services.map(({ icon: Icon, title, image, body }) => (
              <div
                key={title}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div
                  className="aspect-video w-full bg-cover bg-center"
                  style={{ backgroundImage: `url('${image}')` }}
                />
                <div className="p-6">
                  <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
                    <Icon className="size-5 text-accent" />
                  </div>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <Button asChild className="h-12 px-8 text-base font-medium">
              <Link href={getStartedHref}>Get Started</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-muted py-12 sm:py-16">
        <div className="mx-auto w-full px-4 text-center sm:px-6 lg:w-[90vw] lg:px-0">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            As featured at
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {featuredAt.map(({ name, src }) => (
              <div
                key={src}
                className="relative flex h-20 items-center justify-center rounded-xl border border-border p-4"
                style={{ backgroundColor: "#FFFFFF" }}
              >
                <NextImage
                  src={src}
                  alt={name}
                  fill
                  sizes="(min-width: 640px) 25vw, 50vw"
                  className="object-contain p-2"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="relative overflow-hidden py-32 sm:py-40"
        style={{ backgroundColor: "#4C9997" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 80% 50%, rgba(51,51,51,0.12) 0%, transparent 60%), " +
              "radial-gradient(ellipse at 20% 80%, rgba(51,51,51,0.10) 0%, transparent 55%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 text-center sm:px-6 lg:w-[90vw] lg:px-0">
          <h2
            className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
            style={{ color: "#FFFFFF" }}
          >
            {isLoggedIn
              ? "Ready to make your next AI avatar video?"
              : "Ready to create your first AI avatar?"}
          </h2>
          <p
            className="mx-auto mt-5 max-w-sm text-lg leading-relaxed"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            {isLoggedIn
              ? "Jump back into your dashboard and keep going."
              : "Make professional videos without a production crew."}
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            {isLoggedIn ? (
              <Button
                asChild
                className="h-12 px-8 text-base font-medium"
                style={{
                  backgroundColor: "#FFFFFF",
                  color: "#4C9997",
                  borderColor: "transparent",
                }}
              >
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  className="h-12 px-8 text-base font-medium"
                  style={{
                    backgroundColor: "#FFFFFF",
                    color: "#4C9997",
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
                    border: "1px solid rgba(255,255,255,0.5)",
                    color: "#FFFFFF",
                  }}
                >
                  <Link href="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
