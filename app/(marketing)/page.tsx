import Link from "next/link";
import NextImage from "next/image";
import { auth } from "@/auth";
import { Quote, UserSquare2, Bot, Presentation, User, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/marketing/pricing-section";
import { HowItLooksVideo } from "@/components/marketing/how-it-looks-video";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlForImage } from "@/sanity/lib/image";
import { organizationJsonLd, pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";

type SanityImageRef = { asset?: { _ref: string } } | null;

type HeadingIntro = {
  headingPrefix: string;
  headingAccent: string;
  subheading: string;
};

type TestimonialItem = {
  quote: string;
  name: string;
  role: string;
  company: string;
};

type StepItem = {
  title: string;
  body: string;
};

type ClientLogoItem = {
  name: string;
  logo: SanityImageRef;
};

type ServiceItem = {
  title: string;
  body: string;
  image: SanityImageRef;
};

type FeaturedAtItem = {
  name: string;
  logo: SanityImageRef;
};

type AwardItem = {
  name: string;
  logo: SanityImageRef;
};

type HomepageContent = {
  hero: {
    heading: string;
    ctaLabel: string;
    backgroundImage: SanityImageRef;
  } | null;
  intro: {
    headingPrefix: string;
    headingAccent: string;
    body: string;
    image: SanityImageRef;
    ctaLabel: string;
  } | null;
  howItWorks: (HeadingIntro & { steps: StepItem[]; ctaLabel: string }) | null;
  howItLooks: HeadingIntro | null;
  testimonialsIntro:
    | (HeadingIntro & { items: TestimonialItem[]; logos: ClientLogoItem[] })
    | null;
  services:
    | { heading: string; subheading: string; items: ServiceItem[]; ctaLabel: string }
    | null;
  featuredAt: { heading: string; items: FeaturedAtItem[] } | null;
  awards: { heading: string; items: AwardItem[] } | null;
};

// One combined GROQ query — a single round trip to Sanity for every
// editable piece of this page, rather than five separate fetches.
const HOMEPAGE_CONTENT_QUERY = `{
  "hero": *[_type == "homepageHero"][0]{heading, ctaLabel, backgroundImage},
  "intro": *[_type == "homepageIntro"][0]{headingPrefix, headingAccent, body, image, ctaLabel},
  "howItWorks": *[_type == "homepageHowItWorks"][0]{headingPrefix, headingAccent, subheading, steps[]{title, body}, ctaLabel},
  "howItLooks": *[_type == "homepageHowItLooks"][0]{headingPrefix, headingAccent, subheading},
  "testimonialsIntro": *[_type == "homepageTestimonialsIntro"][0]{headingPrefix, headingAccent, subheading, items[]{quote, name, role, company}, logos[]{name, logo}},
  "services": *[_type == "homepageServices"][0]{heading, subheading, items[]{title, body, image}, ctaLabel},
  "featuredAt": *[_type == "homepageFeaturedAt"][0]{heading, items[]{name, logo}},
  "awards": *[_type == "homepageAwards"][0]{heading, items[]{name, logo}}
}`;

// Editable in Studio (/admin/studio) once each document is published —
// these are the exact hardcoded values every visitor saw before the CMS
// existed, and what still renders per-section if that document hasn't been
// published yet, or Sanity isn't configured in this environment. Each
// section falls back independently, so publishing just the hero doesn't
// require also publishing the others.
const DEFAULTS = {
  hero: {
    heading: "Your Business. Future Ready.",
    ctaLabel: "Get Started",
    backgroundImageUrl: "/hero-bg-new.avif",
  },
  intro: {
    headingPrefix: "We create your",
    headingAccent: "digital twin",
    body: "One capture. Infinite communication. It speaks, looks, and sounds exactly like you, training teams, updating clients, and pitching investors in 175+ languages, at 4K quality, anywhere, anytime.",
    // No imageUrl fallback, deliberately — an admin must publish a real
    // image in Studio before this section shows one; the site never
    // silently substitutes the old hardcoded photo, which would leave
    // Studio (empty field) and the live site (an image anyway) telling two
    // different stories.
    ctaLabel: "Learn More",
  },
  howItWorks: {
    headingPrefix: "How It",
    headingAccent: "Works",
    subheading: "We create a photorealistic digital twin of your staff.",
    steps: [
      {
        title: "Choose your Plan",
        body: "Choose your plan. Our team visits your workplace, anywhere in Australia. 30 minutes per person, up to 10 staff in one day.",
      },
      {
        title: "We Build Your Avatar",
        body: "We create and train your avatar. No technical setup required from your team.",
      },
      {
        title: "Your Avatar Is Ready",
        body: "We deploy your avatar and give you access to our platform. Your team can create business content on demand, in 175+ languages.",
      },
    ],
    ctaLabel: "Get Started",
  },
  howItLooks: {
    headingPrefix: "How It",
    headingAccent: "Looks",
    subheading:
      "We create a photorealistic digital twin of your team, capable of producing 4K-quality video content from a simple text prompt, no camera, no studio, no reshoots.",
  },
  testimonialsIntro: {
    headingPrefix: "Trusted by",
    headingAccent: "Our Clients",
    subheading: "Real feedback from the teams already using their digital twins.",
    // Plain text, no image involved — same fallback pattern as every other
    // text field on this page (unlike homepageIntro's photo).
    items: [
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
    ],
  },
  services: {
    heading: "Our Services",
    subheading:
      "We capture your digital twin at your office, train and deploy it. Your team can create 4K content with a simple text prompt, in any language, on demand.",
    // No items fallback — each service needs an image, same "no
    // misleading fallback" reasoning as everywhere else on this page.
    ctaLabel: "Get Started",
  },
  featuredAt: {
    heading: "Featured At",
    // No items fallback — logos, same reasoning as above.
  },
  awards: {
    heading: "Awards and Nominations",
    // No items fallback — badge images, same reasoning as above.
  },
};

export const metadata = pageMetadata({
  title: "YouMimic | AI Video Avatars for Business Communication",
  description:
    "Turn one recording into unlimited video content. YouMimic builds photorealistic AI avatars and digital twins that deliver your message in 175+ languages, at scale.",
  path: "/",
});

// Fixed order matching the original 3 services (Digital Twins, Interactive
// Avatars, Holograms) — see homepageServices.ts's comment for why icons
// aren't a CMS field.
const SERVICE_ICONS = [UserSquare2, Bot, Presentation];

export default async function HomePage() {
  const [session, content] = await Promise.all([
    auth(),
    sanityFetch<HomepageContent>(HOMEPAGE_CONTENT_QUERY),
  ]);
  const isLoggedIn = Boolean(session?.user);
  const getStartedHref = isLoggedIn ? "/dashboard" : "/signup";

  const hero = content?.hero;
  const heroHeading = hero?.heading || DEFAULTS.hero.heading;
  const heroCtaLabel = hero?.ctaLabel || DEFAULTS.hero.ctaLabel;
  const heroBackgroundUrl = hero?.backgroundImage
    ? urlForImage(hero.backgroundImage).width(1920).url()
    : DEFAULTS.hero.backgroundImageUrl;

  const intro = content?.intro;
  const introHeadingPrefix = intro?.headingPrefix || DEFAULTS.intro.headingPrefix;
  const introHeadingAccent = intro?.headingAccent || DEFAULTS.intro.headingAccent;
  const introBody = intro?.body || DEFAULTS.intro.body;
  // No local-file fallback here (see DEFAULTS.intro's comment) — null means
  // "show the placeholder" until a real image is published in Studio.
  const introImageUrl = intro?.image ? urlForImage(intro.image).width(1200).url() : null;
  const introCtaLabel = intro?.ctaLabel || DEFAULTS.intro.ctaLabel;

  const howItWorksIntro = content?.howItWorks;
  const howItWorksPrefix = howItWorksIntro?.headingPrefix || DEFAULTS.howItWorks.headingPrefix;
  const howItWorksAccent = howItWorksIntro?.headingAccent || DEFAULTS.howItWorks.headingAccent;
  const howItWorksSubheading = howItWorksIntro?.subheading || DEFAULTS.howItWorks.subheading;
  const howItWorksSteps =
    howItWorksIntro?.steps && howItWorksIntro.steps.length > 0
      ? howItWorksIntro.steps
      : DEFAULTS.howItWorks.steps;
  const howItWorksCtaLabel = howItWorksIntro?.ctaLabel || DEFAULTS.howItWorks.ctaLabel;

  const howItLooksIntro = content?.howItLooks;
  const howItLooksPrefix = howItLooksIntro?.headingPrefix || DEFAULTS.howItLooks.headingPrefix;
  const howItLooksAccent = howItLooksIntro?.headingAccent || DEFAULTS.howItLooks.headingAccent;
  const howItLooksSubheading = howItLooksIntro?.subheading || DEFAULTS.howItLooks.subheading;

  const testimonialsIntro = content?.testimonialsIntro;
  const testimonialsPrefix =
    testimonialsIntro?.headingPrefix || DEFAULTS.testimonialsIntro.headingPrefix;
  const testimonialsAccent =
    testimonialsIntro?.headingAccent || DEFAULTS.testimonialsIntro.headingAccent;
  const testimonialsSubheading =
    testimonialsIntro?.subheading || DEFAULTS.testimonialsIntro.subheading;
  const testimonialsItems =
    testimonialsIntro?.items && testimonialsIntro.items.length > 0
      ? testimonialsIntro.items
      : DEFAULTS.testimonialsIntro.items;
  // No code fallback here — same "no misleading fallback" reasoning as the
  // Digital Twin Intro's image. If no logos are published, the grid just
  // doesn't render (see the conditional below) instead of silently
  // continuing to show the old hardcoded logo files.
  const clientLogoItems = testimonialsIntro?.logos ?? [];

  const servicesContent = content?.services;
  const servicesHeading = servicesContent?.heading || DEFAULTS.services.heading;
  const servicesSubheading = servicesContent?.subheading || DEFAULTS.services.subheading;
  const servicesCtaLabel = servicesContent?.ctaLabel || DEFAULTS.services.ctaLabel;
  // No fallback — each service needs an image (see DEFAULTS.services'
  // comment), so an empty/missing document just hides the whole grid.
  const servicesItems = servicesContent?.items ?? [];

  const featuredAtContent = content?.featuredAt;
  const featuredAtHeading = featuredAtContent?.heading || DEFAULTS.featuredAt.heading;
  // No fallback — logos, same reasoning as servicesItems above.
  const featuredAtItems = featuredAtContent?.items ?? [];

  const awardsContent = content?.awards;
  const awardsHeading = awardsContent?.heading || DEFAULTS.awards.heading;
  // No fallback — badge images, same reasoning as featuredAtItems above.
  const awardsItems = (awardsContent?.items ?? []).filter((item) => item.logo);

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
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
                backgroundImage: `url('${heroBackgroundUrl}')`,
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
                className="max-w-3xl text-5xl font-bold leading-[0.98] tracking-tighter sm:text-6xl lg:text-8xl"
                style={{
                  color: "#FFFFFF",
                  textShadow: "0 2px 10px rgba(0,0,0,0.35)",
                }}
              >
                {heroHeading}
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
                  <Link href={getStartedHref}>{heroCtaLabel}</Link>
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
                {introHeadingPrefix}{" "}
                <span style={{ color: "#4C9997" }}>{introHeadingAccent}</span>.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
                {introBody}
              </p>
              <div className="mt-8 flex justify-center lg:justify-start">
                <Button
                  asChild
                  variant="outline"
                  className="h-11 px-6 text-sm font-medium"
                >
                  <Link href="/solutions">{introCtaLabel}</Link>
                </Button>
              </div>
            </div>

            <div className="mx-auto w-full max-w-sm lg:max-w-md">
              {introImageUrl ? (
                <div
                  className="aspect-21/9 w-full overflow-hidden rounded-xl bg-cover bg-center"
                  style={{ backgroundImage: `url('${introImageUrl}')` }}
                />
              ) : (
                // No fallback to a local file here on purpose (see
                // DEFAULTS.intro's comment) — an admin must publish a real
                // image in Studio before this section shows one.
                <div className="flex aspect-21/9 w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageOff className="size-6" aria-hidden="true" />
                    <p className="text-xs">Image not set in Studio</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <PricingSection id="pricing" />

      <section className="relative overflow-hidden bg-muted py-16 sm:py-20">
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
          <div className="mb-10 text-center">
            <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
              {howItWorksPrefix} <span style={{ color: "#4C9997" }}>{howItWorksAccent}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              {howItWorksSubheading}
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-3">
            {howItWorksSteps.map(({ title, body }, i) => (
              <ScrollReveal key={title} delay={i * 200}>
                <div className="relative text-center">
                  <p className="text-base font-medium text-muted-foreground">
                    Step {i + 1}
                  </p>
                  <h3
                    className="mt-1 mb-2 text-2xl font-bold tracking-tight sm:text-3xl"
                    style={{ color: "#4C9997" }}
                  >
                    {title}
                  </h3>
                  <p className="text-lg leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <div className="mt-12 flex justify-center">
            <Button asChild className="h-12 px-8 text-base font-medium">
              <Link href={getStartedHref}>{howItWorksCtaLabel}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full px-4 text-center sm:px-6 lg:w-[90vw] lg:px-0">
          <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
            {howItLooksPrefix} <span style={{ color: "#4C9997" }}>{howItLooksAccent}</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {howItLooksSubheading}
          </p>
          <HowItLooksVideo
            src="/how-it-looks.mp4"
            className="mx-auto mt-8 aspect-video w-full max-w-5xl"
          />
        </div>
      </section>

      <section
        className="relative overflow-hidden py-24 sm:py-32"
        style={{ backgroundColor: "#333333" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 85% 10%, rgba(76,153,151,0.18) 0%, transparent 50%), " +
              "radial-gradient(ellipse at 10% 90%, rgba(76,153,151,0.14) 0%, transparent 45%)",
          }}
        />
        <Quote
          className="pointer-events-none absolute -left-10 -top-10 size-64 text-white/5 sm:size-80"
          strokeWidth={1}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-16 text-center">
            <h2
              className="text-4xl font-bold tracking-tighter sm:text-5xl lg:text-6xl"
              style={{ color: "#FFFFFF" }}
            >
              {testimonialsPrefix} <span style={{ color: "#4C9997" }}>{testimonialsAccent}</span>
            </h2>
            <p
              className="mx-auto mt-4 max-w-md text-lg"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              {testimonialsSubheading}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {testimonialsItems.map(({ quote, name, role, company }) => (
              <div
                key={name}
                className="relative flex flex-col overflow-hidden rounded-xl bg-white/10 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:bg-white/15"
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
                      "radial-gradient(ellipse at 100% 0%, rgba(76,153,151,0.18) 0%, transparent 55%)",
                  }}
                />
                <Quote className="relative z-10 size-6 text-accent" />
                <p
                  className="relative z-10 mt-4 flex-1 text-sm leading-relaxed"
                  style={{ color: "#FFFFFF" }}
                >
                  {quote}
                </p>
                <div className="relative z-10 mt-6 flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <User className="size-4" style={{ color: "rgba(255,255,255,0.7)" }} />
                  </div>
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "#FFFFFF" }}
                    >
                      {name}
                    </p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                      {role},{" "}
                      <span style={{ color: "#4C9997" }}>{company}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {clientLogoItems.length > 0 && (
            <div className="mt-20">
              {/* 5 columns at lg: forms two rows of five for a 10-logo list;
                  fewer/more logos just reflow normally. No fallback to the
                  old hardcoded logo files if this array is empty (see
                  clientLogoItems above) — the whole block just doesn't
                  render rather than showing logos Studio can't reflect. */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {/* brightness-0 invert (not grayscale/grayscale invert) — the
                    same "force solid white" technique already used for the
                    header/footer icon on this same dark background (see
                    components/branding/site-logo.tsx). Every logo, regardless
                    of its own original colors, becomes a plain white
                    silhouette. p-4 makes the visible logo noticeably larger
                    within the same box. */}
                {clientLogoItems
                  .filter((item) => item.logo)
                  .map(({ name, logo }) => (
                    <div
                      key={name}
                      className="relative mx-auto flex aspect-[179.57/167.13] w-full max-w-40 items-center justify-center"
                    >
                      <NextImage
                        src={urlForImage(logo!).width(320).url()}
                        alt={name}
                        fill
                        sizes="160px"
                        className="object-contain p-4 brightness-0 invert"
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}
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
              {servicesHeading}
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
              {servicesSubheading}
            </p>
          </div>
          {servicesItems.length > 0 && (
            <>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {servicesItems.map(({ title, body, image }, i) => {
                  // Icon stays fixed by position rather than a CMS field —
                  // see homepageServices.ts's comment for why.
                  const Icon = SERVICE_ICONS[i % SERVICE_ICONS.length];
                  return (
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
                            style={{
                              backgroundImage: image
                                ? `url('${urlForImage(image).width(800).url()}')`
                                : undefined,
                            }}
                          />
                          <span className="absolute left-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/50 text-sm font-semibold text-white backdrop-blur-sm">
                            {String(i + 1).padStart(2, "0")}
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
                  );
                })}
              </div>
              <div className="mt-10 flex justify-center">
                <Button asChild className="h-12 px-8 text-base font-medium">
                  <Link href={getStartedHref}>{servicesCtaLabel}</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="bg-muted py-12 sm:py-16">
        <div className="mx-auto w-full px-4 text-center sm:px-6 lg:w-[90vw] lg:px-0">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {featuredAtHeading}
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {featuredAtItems
              .filter((item) => item.logo)
              .map(({ name, logo }) => (
                <div
                  key={name}
                  className="relative mx-auto flex aspect-[179.57/167.13] w-full max-w-40 items-center justify-center"
                >
                  <NextImage
                    src={urlForImage(logo!).width(320).url()}
                    alt={name}
                    fill
                    sizes="160px"
                    className="object-contain p-4 brightness-0 dark:invert"
                  />
                </div>
              ))}
          </div>
        </div>
      </section>

      {awardsItems.length > 0 && (
        <section className="py-16 sm:py-20">
          <div className="mx-auto w-full px-4 text-center sm:px-6 lg:w-[90vw] lg:px-0">
            <h2 className="text-3xl font-bold tracking-tighter text-foreground sm:text-4xl">
              {awardsHeading}
            </h2>
            {/* True greyscale (not the solid-silhouette brightness-0 used for
                Featured At/clients, which would flatten these detailed
                badges into blobs). dark:invert flips the badges' dark
                text to light so it stays readable on the dark theme. No
                tile, border or background. */}
            <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {awardsItems.map(({ name, logo }) => (
                <div
                  key={name}
                  className="relative mx-auto aspect-square w-full max-w-64"
                >
                  <NextImage
                    src={urlForImage(logo!).width(600).url()}
                    alt={name}
                    fill
                    sizes="(min-width: 1024px) 256px, 45vw"
                    className="object-contain grayscale dark:invert"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <FinalCtaSection isLoggedIn={isLoggedIn} />
    </>
  );
}
