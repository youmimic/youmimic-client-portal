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
      <section className="border-b border-border bg-muted py-16 sm:py-20">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="max-w-xl">
            <p className="mb-3 text-sm font-medium text-accent">Get in touch</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
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
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "#FFFFFF" }}>
            Our offices
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {offices.map(({ city, address }) => (
              <div
                key={city}
                className="rounded-xl p-6 text-center"
                style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <p className="text-lg font-semibold" style={{ color: "#FFFFFF" }}>
                  {city}
                </p>
                <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {address}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two-column: form + Calendly */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            {/* Contact form */}
            <div>
              <h2 className="mb-6 text-xl font-semibold text-foreground">
                Send us a message
              </h2>
              <ContactForm />
            </div>

            {/* Calendly inline widget */}
            <div id="book-demo" className="scroll-mt-20">
              <h2 className="mb-6 text-xl font-semibold text-foreground">
                Book a demo
              </h2>
              <div className="h-125 overflow-hidden rounded-xl border border-border sm:h-150 lg:h-175">
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
