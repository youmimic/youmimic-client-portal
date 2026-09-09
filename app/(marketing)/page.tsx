import Link from "next/link";
import NextImage from "next/image";
import { auth } from "@/auth";
import { Quote, UserSquare2, Bot, Presentation, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/marketing/pricing-section";
import { HowItLooksVideo } from "@/components/marketing/how-it-looks-video";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";

const howItWorks = [
  {
    n: "01",
    title: "Book Your Session",
    body: "We come to you, anywhere in Australia.",
  },
  {
    n: "02",
    title: "Your Avatar Setup",
    body: "We build and train your avatar.",
  },
  {
    n: "03",
    title: "Your Avatar Is Ready",
    body: "Create content on demand, in 175+ languages.",
  },
];

const testimonials = [
  {
    quote:
      "You Mimic AI are amazing! From capture session to onboarding and support. The quality of my avatar is mind blowing!",
    name: "Patrick Lang",
    role: "Realtor",
    company: "Belle Property Australia",
  },
  {
    quote:
      "You Mimic AI is a truly forward-thinking partner for us. Hyper-realistic avatars that power our Sales Kick-offs, Town Halls and Customer Presentations. It saves us time.",
    name: "Joel Starkey",
    role: "Sales Enablement",
    company: "DXC Technology",
  },
  {
    quote:
      "You Mimic AI are the gold standard in avatar captures and set the benchmark for quality, ethics and responsible AI.",
    name: "Dr. Catherine Ball",
    role: "Corporate Speaker",
    company: "Xprize Board Member",
  },
];

const services = [
  {
    n: "01",
    icon: UserSquare2,
    title: "Digital Twins",
    image: "/digital-twins.avif",
    body: "Photorealistic digital twins of your people, from executives and subject-matter experts to entire teams. Generate training, sales, internal communications, and customer content on demand, refreshed anytime without booking a new recording session.",
  },
  {
    n: "02",
    icon: Bot,
    title: "Interactive Avatars",
    image: "/interactive avatars.avif",
    body: "Turn your digital twins into interactive AI employees, trained on your approved business knowledge. They can answer questions, onboard staff, support customers, and deliver information around the clock in most languages.",
  },
  {
    n: "03",
    icon: Presentation,
    title: "Holograms",
    image: "/holograms.avif",
    body: "Life-size digital presenters for malls, airports, terminals, retail, and events, delivering branded content, advertising, and customer engagement around the clock, without needing on-site staff to keep them running.",
  },
];

// Every file in the "Where you've seen us / Featured At" folder — skipping
// blob.png, which is a duplicate of images.jpg's Australian Computer
// Society mark (icon-only vs. icon+wordmark) rather than a distinct logo.
// "Rotary Australia" and "Tasmanian Business Conference" were dropped —
// their source files were deleted from the Featured At folder with no
// replacement uploaded. EdCAT now points at edcat.png (edcat.jpg was
// deleted and replaced with a cleaner logo-only export). `dark` flips
// TEDx Hobart to a dark chip since its wordmark is red-and-white ink on
// a transparent background — the white half disappears on a white card.
const featuredAt = [
  {
    name: "SXSW Sydney",
    src: "/Where you've seen us/Featured At/SXSW_Sydney_2023_Hero.jpg",
  },
  {
    name: "TEDx Hobart",
    src: "/Where you've seen us/Featured At/tedxHobart.png",
    dark: true,
  },
  {
    name: "Governance Institute of Australia",
    src: "/Where you've seen us/Featured At/Govenerae Instiatute of Australia.jpg",
  },
  { name: "EdCAT 2026", src: "/Where you've seen us/Featured At/edcat.png" },
];

// Every file in the Client Logos folder — matched to its actual company
// name rather than the raw (often auto-generated) filename. `dark` flips a
// card to a dark chip for the one asset that's white ink on transparent
// (needs a dark surface to be visible); everything else already carries
// its own background or reads fine on white.
const clientLogos = [
  { name: "4Front", src: "/Client Logos/13224_4Front logo hi-res.jpg" },
  {
    name: "Adam Spencer",
    src: "/Client Logos/Adam Spencer - Corporate Speaker.jpg",
  },
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
                  "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.35) 35%, transparent 65%)",
              }}
            />

            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 lg:p-14">
              <h1
                className="hero-text-3d max-w-3xl text-5xl font-bold leading-[0.98] tracking-tighter sm:text-6xl lg:text-8xl"
                style={{ color: "#FFFFFF" }}
              >
                Your Business. Future Ready.
              </h1>
              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Button
                  asChild
                  className="h-14 px-10 text-base font-semibold sm:text-lg"
                  style={{
                    backgroundColor: "#4C9997",
                    color: "#FFFFFF",
                    borderColor: "#4C9997",
                  }}
                >
                  <Link href={getStartedHref}>Get Started</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 sm:py-32">
        {/* Single soft circular glow behind the image side — a distinct
            shape/position from the corner-pair glow used elsewhere, so the
            teal accent reads as varied rather than one effect repeated. */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 75% 50%, rgba(76,153,151,0.14) 0%, transparent 55%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="text-center lg:text-left">
              <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
                We create your{" "}
                <span style={{ color: "#4C9997" }}>digital twin</span>.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
                One capture. Infinite communication. It speaks, looks, and
                sounds exactly like you, training teams, updating clients, and
                pitching investors in 175+ languages, at 4K quality, anywhere,
                anytime.
              </p>
              <div className="mt-8 flex justify-center lg:justify-start">
                <Button
                  asChild
                  variant="outline"
                  className="h-11 px-6 text-sm font-medium"
                >
                  <Link href="/solutions">Learn More</Link>
                </Button>
              </div>
            </div>

            <div className="mx-auto w-full max-w-sm lg:max-w-md">
              <div
                className="aspect-21/9 w-full overflow-hidden rounded-xl bg-cover bg-center"
                style={{ backgroundImage: "url('/digital-twin-photo.avif')" }}
              />
            </div>
          </div>
        </div>
      </section>

      <PricingSection id="pricing" isLoggedIn={isLoggedIn} />

      <section className="relative overflow-hidden bg-muted py-24 sm:py-32">
        {/* Decorative background — a soft teal glow, matching the same
            treatment used on the hero, final CTA, and testimonials
            sections. Purely decorative: pointer-events-none + aria-hidden. */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 12% 15%, rgba(76,153,151,0.14) 0%, transparent 50%), " +
              "radial-gradient(ellipse at 90% 85%, rgba(76,153,151,0.12) 0%, transparent 48%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
              How It <span style={{ color: "#4C9997" }}>Works</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              We create a photorealistic digital twin of your staff.
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-3">
            {howItWorks.map(({ n, title, body }) => (
              <div key={n} className="relative">
                <span className="mb-4 block text-5xl font-bold tracking-tighter text-primary">
                  {n}
                </span>
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
          <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
            How It <span style={{ color: "#4C9997" }}>Looks</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            We create a photorealistic digital twin of your team, capable of
            producing 4K-quality video content from a simple text prompt, no
            camera, no studio, no reshoots.
          </p>
          <HowItLooksVideo
            src="/how-it-looks.mp4"
            className="mx-auto mt-8 aspect-video w-full max-w-5xl"
          />
        </div>
      </section>

      <section className="relative overflow-hidden bg-muted py-24 sm:py-32">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 85% 10%, rgba(76,153,151,0.14) 0%, transparent 50%), " +
              "radial-gradient(ellipse at 10% 90%, rgba(76,153,151,0.10) 0%, transparent 45%)",
          }}
        />
        <Quote
          className="pointer-events-none absolute -left-10 -top-10 size-64 text-primary/5 sm:size-80"
          strokeWidth={1}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
              Trusted by <span style={{ color: "#4C9997" }}>Our Clients</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              Real feedback from the teams already using their digital twins.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.map(({ quote, name, role, company }) => (
              <div
                key={name}
                className="relative flex flex-col overflow-hidden rounded-xl bg-card/60 p-6 backdrop-blur-sm transition-all duration-300 shadow-[0_1px_2px_rgba(51,51,51,0.06),0_8px_16px_-4px_rgba(51,51,51,0.10),0_20px_32px_-8px_rgba(76,153,151,0.12)] hover:-translate-y-1.5 hover:shadow-[0_2px_4px_rgba(51,51,51,0.08),0_16px_28px_-6px_rgba(51,51,51,0.16),0_28px_44px_-10px_rgba(76,153,151,0.22)]"
              >
                {/* Each card gets its own small glow, echoing the
                    section's ambient one at a smaller scale, while the
                    semi-transparent card background lets the section's
                    glow bleed through underneath. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  aria-hidden="true"
                  style={{
                    background:
                      "radial-gradient(ellipse at 100% 0%, rgba(76,153,151,0.14) 0%, transparent 55%)",
                  }}
                />
                <Quote className="relative z-10 size-6 text-accent" />
                <p className="relative z-10 mt-4 flex-1 text-sm leading-relaxed text-foreground">
                  {quote}
                </p>
                <div className="relative z-10 mt-6 flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {role},{" "}
                      <span style={{ color: "#4C9997" }}>{company}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-20">
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {clientLogos.map(({ name, src, dark }) => (
                <div
                  key={src}
                  className="group relative flex h-20 items-center justify-center rounded-xl shadow-sm transition-shadow duration-300 hover:shadow-md"
                  style={{ backgroundColor: dark ? "#333333" : "#FFFFFF" }}
                >
                  <NextImage
                    src={src}
                    alt={name}
                    fill
                    sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw"
                    className="object-contain p-5 grayscale opacity-60 transition-all duration-300 group-hover:grayscale-0 group-hover:opacity-100"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 sm:py-32">
        {/* Subtle bottom-left ellipse glow — kept low-opacity since this
            section's own service-card images already carry visual weight;
            a third distinct shape/position after the circle (Digital Twin
            intro) and top spotlight (Pricing), completing the varied set. */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 15% 100%, rgba(76,153,151,0.10) 0%, transparent 45%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
              Our Services
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
              We capture your digital twin at your office, train and deploy it.
              Your team can create 4K content with a simple text prompt, in any
              language, on demand.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map(({ n, icon: Icon, title, image, body }, i) => (
              <ScrollReveal key={title} delay={i * 100}>
                <div className="group relative overflow-hidden rounded-xl border border-border bg-card/60 backdrop-blur-sm transition-shadow duration-300 hover:shadow-lg">
                  {/* Per-card glow, echoing the section's own ambient
                      radial gradient at a smaller scale, same technique
                      used for the testimonial cards. Visible through the
                      card's translucent background in the content area
                      below the (opaque) image. */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    aria-hidden="true"
                    style={{
                      background:
                        "radial-gradient(ellipse at 100% 0%, rgba(76,153,151,0.14) 0%, transparent 55%)",
                    }}
                  />
                  <div className="relative z-10 aspect-video w-full overflow-hidden">
                    <div
                      className="h-full w-full bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-105"
                      style={{ backgroundImage: `url('${image}')` }}
                    />
                    <span className="absolute left-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/50 text-sm font-semibold text-white backdrop-blur-sm">
                      {n}
                    </span>
                  </div>
                  <div className="relative z-10 p-6">
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
              </ScrollReveal>
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
            Featured At
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {featuredAt.map(({ name, src, dark }) => (
              <div
                key={src}
                className="group relative flex h-20 items-center justify-center rounded-xl p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
                style={{ backgroundColor: dark ? "#333333" : "#FFFFFF" }}
              >
                <NextImage
                  src={src}
                  alt={name}
                  fill
                  sizes="(min-width: 640px) 20vw, 50vw"
                  className="object-contain p-5 grayscale opacity-60 transition-all duration-300 group-hover:grayscale-0 group-hover:opacity-100"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <FinalCtaSection isLoggedIn={isLoggedIn} />
    </>
  );
}
