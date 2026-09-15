import type { Metadata } from "next";
import {
  Landmark,
  FileDown,
  ChevronDown,
  Users,
  Eye,
  ShieldCheck,
  Scale,
  ClipboardCheck,
  UserCheck,
  Fingerprint,
  Lock,
  Ban,
  Globe2,
} from "lucide-react";
import { DarkCtaBand } from "@/components/marketing/dark-cta-band";

export const metadata: Metadata = {
  title: "AI Ethics | YouMimic",
  description:
    "YouMimic's approach to responsible AI avatar generation: our policy regulators, our guiding principles, and our ethics commitment.",
};

// ─── Data ────────────────────────────────────────────────────────────────────

const regulators = [
  {
    name: "Australian Federal Government",
    doc: "Australia's AI Ethics Principles",
    href: "/Industry.gov_ai_ethics_principles.pdf",
  },
  {
    name: "Screen Australia",
    doc: "AI Guiding Principles",
    sub: "Australian Federal Government",
    href: "/Screen-Australia-AI-Guiding-Principles.pdf",
  },
];

const principles = [
  {
    icon: Users,
    title: "Talent, creativity, culture and the individual",
    body: "We prioritise the human talent, creativity and culture that are the heart of Australia's screen industry and the content it creates. This includes ensuring that the rights of screen practitioners are adequately protected, including in relation to the use of their personal information and intellectual property in training data, prompts, or any generated outputs from AI systems. Indigenous Cultural & Intellectual Property rights must be respected in any use of AI, with all decisions and operations guided by clear business frameworks, mutual accountability, and shared respect.",
  },
  {
    icon: Eye,
    title: "Transparency",
    body: "Use of AI should be based on trust, which in turn requires transparency. YouMimic, stakeholders, and the wider industry should be informed about how and when AI may be used, for what purposes, and who may be impacted.",
  },
  {
    icon: ShieldCheck,
    title: "Ethical use of AI",
    body: "We support the ethical use of AI systems and encourage the application of Australia's AI Ethics Principles in the design, development and implementation of AI diversity, equity and inclusion. We encourage active consideration of how AI tools may be utilised to increase diversity, equity and inclusion. Their use should not result in discrimination for any individual, community or group, or perpetuate societal injustices.",
  },
  {
    icon: Scale,
    title: "Fairness",
    body: "In keeping with an ethical use of AI, each person (or the organisation they work for) has the right to choose what their avatar says. Consent to the use of AI in relation to their content, likeness, or performance must be fair.",
  },
  {
    icon: ClipboardCheck,
    title: "Responsibility and accountability",
    body: "Responsibility must be taken for any use of AI systems. This includes ensuring that the proposed use is informed, and that there is sufficient governance and oversight with clear lines of accountability. Appropriate risk assessment, due diligence and security measures must be implemented, particularly in relation to the handling of data, intellectual property, and personal and confidential information. Processes should be put in place to continually test and challenge the use or outcomes of AI systems.",
  },
];

const commitments = [
  {
    icon: UserCheck,
    title: "Human-Centric by Design",
    body: "Our AI avatars are developed with the explicit consent and involvement of the person it represents.",
  },
  {
    icon: Fingerprint,
    title: "Consent, Control, and Transparency",
    body: "Your avatar only says what you approve. We never generate or publish AI content without your clear, documented consent. You retain full control over how your likeness is used.",
  },
  {
    icon: Lock,
    title: "Privacy and Data Protection",
    body: "We comply with the Australian Privacy Principles (APPs) and international best practices. Biometric and voice data are securely stored, encrypted, and never sold or shared with third parties.",
  },
  {
    icon: Ban,
    title: "No Deepfakes, No Deception",
    body: "We do not support deceptive AI use. All YouMimic avatars are used for clearly disclosed, authorised communication. We oppose synthetic media designed to impersonate or mislead, including any script provided for that purpose. We will not generate content that breaches our policy terms.",
  },
  {
    icon: Globe2,
    title: "Cultural and Social Responsibility",
    body: "We respect the diversity of voices and communities across Australia and globally. Our tools are designed to uplift communication, not to exploit, caricature, or silence it.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiEthicsPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-muted py-20 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 90% 10%, rgba(76,153,151,0.14) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="max-w-2xl">
            <div
              className="mb-6 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              style={{
                border: "1px solid rgba(76,153,151,0.30)",
                backgroundColor: "rgba(76,153,151,0.08)",
                color: "#4C9997",
              }}
            >
              AI Ethics
            </div>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
              Built on <span style={{ color: "#4C9997" }}>trust</span>.
              <br />
              Guided by principle.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Every avatar we create carries someone&apos;s voice, likeness, and
              reputation. We take that as seriously as the technology itself,
              and we hold ourselves to real regulatory standards, not just our
              own good intentions.
            </p>
          </div>
        </div>
      </section>

      {/* ── Our Policy Regulators ────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border py-16 sm:py-20">
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-10 flex items-center gap-3">
            <Landmark className="size-6 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <h2 className="text-2xl font-bold tracking-tighter text-foreground sm:text-3xl">
                Our Policy Regulators
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Two published frameworks we align our own practice with, available here as PDF.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {regulators.map(({ name, doc, sub, href }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_8px_24px_-8px_rgba(76,153,151,0.25)]"
              >
                <div>
                  <p className="text-xs font-semibold tracking-wide text-accent uppercase">
                    {sub ?? name}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    {sub ? name : doc}
                  </h3>
                  {sub && (
                    <p className="mt-1 text-sm text-muted-foreground">{doc}</p>
                  )}
                </div>
                <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-accent">
                  Learn more
                  <FileDown
                    className="size-3.5 transition-transform group-hover:translate-y-0.5"
                    aria-hidden="true"
                  />
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Guiding Principles ───────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-muted py-20 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 8% 10%, rgba(76,153,151,0.12) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tighter text-foreground sm:text-4xl">
              Our Guiding Principles
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              Five commitments behind every avatar we build, shaped alongside
              Australia&apos;s own AI ethics frameworks.
            </p>
          </div>
          {/* columns-*, not grid-cols-* — avoids grid row-tracks stretching to the tallest open card. */}
          <div className="columns-1 gap-4 lg:columns-2">
            {principles.map(({ icon: Icon, title, body }, i) => (
              <details
                key={title}
                name="guiding-principles"
                className="group mb-4 break-inside-avoid rounded-xl bg-card shadow-[0_1px_2px_rgba(51,51,51,0.06),0_8px_16px_-4px_rgba(51,51,51,0.10),0_20px_32px_-8px_rgba(76,153,151,0.12)] transition-shadow duration-300"
              >
                <summary className="flex cursor-pointer list-none items-center gap-5 p-6 [&::-webkit-details-marker]:hidden">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
                    <Icon className="size-5 text-accent" aria-hidden="true" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-accent">
                      0{i + 1}
                    </p>
                    <h3 className="mt-0.5 text-sm font-semibold text-foreground">
                      {title}
                    </h3>
                  </div>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="px-6 pb-6 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Ethics Commitment ────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border py-20 sm:py-24">
        <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tighter text-foreground sm:text-4xl">
              Our Ethics Commitment
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              What we actually promise, in plain terms, every time your likeness
              is used.
            </p>
          </div>

          <div className="mx-auto max-w-3xl">
            {commitments.map(({ icon: Icon, title, body }, i) => (
              <div
                key={title}
                className="relative flex gap-6 py-8 first:pt-0 last:pb-0"
              >
                {/* Connecting rail — a small creative touch tying each
                    commitment to the next, like a signed pledge list. */}
                {i !== commitments.length - 1 && (
                  <div
                    className="absolute top-16 left-6.75 h-[calc(100%-1rem)] w-px"
                    style={{ backgroundColor: "rgba(76,153,151,0.25)" }}
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex size-14 shrink-0 flex-col items-center justify-center rounded-full border border-accent/25 bg-card">
                  <Icon className="size-5 text-accent" aria-hidden="true" />
                </div>
                <div className="pt-1">
                  <span
                    className="text-4xl font-bold tracking-tighter"
                    style={{ color: "rgba(76,153,151,0.20)" }}
                  >
                    {i + 1}
                  </span>
                  <h3 className="-mt-2 text-lg font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── A Living Commitment ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-muted py-16 sm:py-20">
        <div className="relative z-10 mx-auto w-full max-w-2xl px-4 text-center sm:px-6">
          <p className="mb-4 text-xs font-semibold tracking-wide text-accent uppercase">
            A Living Commitment
          </p>
          <p className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            AI is evolving fast. So are our policies.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            We review and adapt our ethical standards regularly, in consultation
            with legal experts, AI researchers, and the people we serve.
          </p>
        </div>
      </section>

      <DarkCtaBand
        heading="Have a question?"
        body="If you'd like to know more about our ethical framework or data handling, get in touch with our team."
        primaryHref="/contact"
        primaryLabel="Get in touch"
        secondaryHref="/"
        secondaryLabel="Back to home"
        paddingClassName="py-14 sm:py-16"
      />
    </>
  );
}
