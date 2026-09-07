import type { Metadata } from "next";
import Link from "next/link";
import { Award, Rocket, Trophy, Newspaper, Building2, Star } from "lucide-react";
import { DarkCtaBand } from "@/components/marketing/dark-cta-band";

export const metadata: Metadata = {
  title: "Press — YouMimic",
  description: "Press coverage and recognition for YouMimic.",
};

// Real press mentions/awards (from glassengine.wixstudio.com/youmimicai's
// /expertise page) — headlines are the real, specific claims from that
// source (typos in the original, e.g. "Startemate"/"iAwrads", corrected
// here). Several items on the source only had generic Wix placeholder body
// text, not real descriptive copy — those get a short, honest line naming
// the real recognition itself rather than inventing specifics that weren't
// given.
const pressItems = [
  {
    icon: Award,
    title: "iAwards Nomination",
    body: "YouMimic was nominated for the national iAwards.",
  },
  {
    icon: Trophy,
    title: "TasICT President's Awards",
    body: "Recognized at the TasICT President's Awards.",
  },
  {
    icon: Rocket,
    title: "Blackbird Ventures shortlists YouMimic for Startmate",
    body: "Beat 900 companies to be shortlisted for the Startmate incubator.",
  },
  {
    icon: Trophy,
    title: "TasICT Finalist",
    body: "A finalist in the TasICT awards.",
  },
  {
    icon: Star,
    title: "Top Companies 2026",
    body: "Named among the Top Companies for 2026.",
  },
  {
    icon: Newspaper,
    title: "Ausprenour Article",
    body: "Featured in an Ausprenour article.",
  },
  {
    icon: Newspaper,
    title: "Australian Business Journal",
    body: "Featured in the Australian Business Journal.",
  },
  {
    icon: Building2,
    title: "DXC Technology Welcomes YouMimic",
    body: "Welcomed into partnership with DXC Technology.",
  },
  {
    icon: Star,
    title: "YouMimic Ambassador",
    body: "Announced a YouMimic Ambassador.",
  },
];

export default function PressPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border py-20 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 90% 10%, rgba(76,153,151,0.14) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-12 max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl">
              Press
            </h1>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Recognition and coverage for YouMimic. For media inquiries,{" "}
              <Link href="/contact" className="text-foreground underline-offset-4 hover:underline">
                get in touch
              </Link>{" "}
              with our team.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pressItems.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex gap-4 rounded-xl bg-card p-6 shadow-[0_1px_2px_rgba(51,51,51,0.06),0_8px_16px_-4px_rgba(51,51,51,0.10),0_20px_32px_-8px_rgba(76,153,151,0.12)] transition-all duration-300 hover:-translate-y-1"
              >
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
                  <Icon className="size-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <DarkCtaBand
        heading="Media inquiries"
        body="Working on a story about YouMimic? Reach out and we'll get you what you need."
        primaryHref="/contact"
        primaryLabel="Contact Us"
        secondaryHref="/media-center"
        secondaryLabel="Media Center"
      />
    </>
  );
}
