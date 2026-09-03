import type { Metadata } from "next";
import Script from "next/script";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact Sales — YouMimic",
  description:
    "Book a demo or reach out to the YouMimic team to learn how AI video avatars can scale your business communication.",
};

export default function ContactPage() {
  return (
    <>
      {/* Page header */}
      <section className="border-b border-border bg-muted py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-xl">
            <p className="mb-3 text-sm font-medium text-accent">Get in touch</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Talk to our team
            </h1>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Whether you&apos;re exploring AI video avatars for the first time
              or ready to deploy at scale, we&apos;re here to help. Send us a
              message or book a time directly below.
            </p>
          </div>
        </div>
      </section>

      {/* Two-column: form + Calendly */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col gap-12">
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
              <div className="overflow-hidden rounded-xl border border-border">
                <div
                  className="calendly-inline-widget"
                  data-url="https://calendly.com/youmimic-sales/new-meeting?primary_color=4c9997"
                  style={{ minWidth: "320px", height: "700px" }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Calendly script — lazyOnload so it doesn't block page render */}
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="lazyOnload"
      />

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
