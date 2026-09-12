import type { Metadata } from "next";
import Script from "next/script";
import { ContactForm } from "@/components/marketing/contact-form";
import { CalendlyInlineWidget } from "@/components/marketing/calendly-widget";

export const metadata: Metadata = {
  title: "Contact Sales — YouMimic",
  description:
    "Book a demo or reach out to the YouMimic team to learn how AI video avatars can scale your business communication.",
};

const offices = [
  { city: "Hobart", address: "Level 5, 24 Davey Street, Tasmania 7008" },
  { city: "Brisbane", address: "79 McLachlan Street, Fortitude Valley, Queensland 4006" },
  { city: "Sydney", address: "Opening Soon" },
];

export default function ContactPage() {
  return (
    <>
      {/* Page header */}
      <section className="relative overflow-hidden border-b border-border bg-muted py-16 sm:py-20">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 85% 20%, rgba(76,153,151,0.14) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="max-w-xl">
            <p className="mb-3 text-sm font-medium text-accent">Get in touch</p>
            <h1 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl">
              We&apos;d love to hear from you
            </h1>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Whether you&apos;re exploring AI video avatars for the first time
              or ready to deploy at scale, we&apos;re here to help. Send us a
              message or book a time directly below.
            </p>
          </div>
        </div>
      </section>

      {/* Our offices — background band. Previously used bg-fixed for a
          parallax effect, but background-attachment: fixed silently
          degrades on iOS Safari/mobile browsers, so it was dropped in
          favor of consistent behavior everywhere over a desktop-only
          nicety. Image is a properly licensed Pexels photo (Pexels
          License, "Free to use") — not the Wix reference's own photo,
          which turned out to be a Flickr image marked "All rights
          reserved" and wasn't safe to use. */}
      <section
        className="relative bg-cover bg-center py-24 sm:py-32"
        style={{ backgroundImage: "url('/contact-bg.avif')" }}
      >
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(51,51,51,0.75)" }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <h2 className="text-center text-3xl font-bold tracking-tighter sm:text-4xl" style={{ color: "#FFFFFF" }}>
            Our offices
          </h2>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {offices.map(({ city, address }) => (
              <div key={city} className="text-center">
                <p className="text-lg font-semibold" style={{ color: "#FFFFFF" }}>
                  {city}
                </p>
                <div
                  className="mx-auto mt-3 h-px w-8"
                  style={{ backgroundColor: "#4C9997" }}
                />
                <p className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {address}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two-column: form + Calendly */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 50% 100%, rgba(76,153,151,0.10) 0%, transparent 45%)",
          }}
        />
        {/* Extra blurred accent behind the form card — same restrained,
            low-opacity technique used on /login and /signup, kept well
            behind the opaque form card so it never touches text contrast. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/3 size-96 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl"
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          {/* Stacked (full-width) until a custom min-[2300px] breakpoint,
              not the usual lg: 2-column split — this isn't just a height
              problem. Calendly's inline widget switches to a taller,
              narrower internal layout (with its own scrollbar) once its
              own container drops below roughly 1000px wide. A 50/50 lg:
              split only gives the widget's column that much room past
              ~2275px of *viewport* width (confirmed by testing) — at any
              more realistic desktop/laptop width, halving the container
              starves it. Full width avoids that everywhere it matters;
              the side-by-side layout only kicks in on monitors wide
              enough that even a half column comfortably clears it. */}
          <div className="grid gap-12 min-[2300px]:grid-cols-2 lg:items-start">
            {/* Contact form */}
            <div>
              <h2 className="mb-6 text-xl font-bold tracking-tight text-foreground">
                Send us a message
              </h2>
              <ContactForm />
            </div>

            {/* Calendly inline widget */}
            <div id="book-demo" className="scroll-mt-20">
              <h2 className="mb-6 text-xl font-bold tracking-tight text-foreground">
                Book a demo
              </h2>
              {/* Calendly's own docs recommend a minimum height of 630px for
                  the inline widget — anything shorter and Calendly renders
                  its own internal scrollbar instead of fitting the calendar
                  + time-slot list, which looks broken. min-h-157.5 (630px)
                  is a hard floor for that reason; h-[min(78vh,760px)] lets
                  it grow with the viewport (without needing separate
                  hand-tuned breakpoint values) but never shrinks past the
                  floor, and caps out at 760px so it doesn't dominate very
                  tall screens. */}
              <div className="h-[min(78vh,760px)] min-h-157.5 overflow-hidden rounded-xl">
                <CalendlyInlineWidget
                  url="https://calendly.com/youmimic-sales/new-meeting?primary_color=4c9997"
                  className="h-full min-w-80"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brevo Conversations chat widget — contact page only (not site-wide).
          Renders as an iframe from conversations-widget.brevo.com once
          loaded; see next.config.ts's CSP for the script-src/frame-src
          entries this needs. */}
      <Script id="brevo-conversations" strategy="lazyOnload">
        {`
          (function(d, w, c) {
              w.BrevoConversationsID = '6a66a96b396a2cd6a604b5e7';
              w[c] = w[c] || function() {
                  (w[c].q = w[c].q || []).push(arguments);
              };
              var s = d.createElement('script');
              s.async = true;
              s.src = 'https://conversations-widget.brevo.com/brevo-conversations.js';
              if (d.head) d.head.appendChild(s);
          })(document, window, 'BrevoConversations');
        `}
      </Script>
    </>
  );
}
