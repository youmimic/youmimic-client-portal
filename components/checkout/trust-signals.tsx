import { Building2, CreditCard, FileText, Lock, Mail, ShieldCheck } from "lucide-react";

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "sales@youmimic.com";

// Small padlock label for the checkout header. Only says what is true of
// the page itself: it is served over HTTPS (HSTS is on, see next.config.ts).
export function SecureCheckoutLabel() {
  return (
    <div
      className="flex items-center gap-1.5 text-xs font-medium"
      style={{ color: "rgba(255,255,255,0.8)" }}
    >
      <Lock className="size-4" style={{ color: "#4C9997" }} aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">Secure checkout</span>
    </div>
  );
}

const linkClass = "font-medium text-foreground underline underline-offset-4";

// Every line here is something the checkout genuinely does. Cards are typed
// on Stripe's hosted page (this app never receives card numbers), Stripe is
// PCI DSS Level 1 certified, and the Australian Privacy Principles claim is
// the same one already published on the AI Ethics page. No badges or
// certifications are shown that the company doesn't hold itself.
//
// `wide` is for full-width placements (guest checkout): the points flow into
// 2 to 3 columns so the panel stays short. The default single column suits
// the narrow signed-in checkout card.
export function CheckoutTrustPanel({ wide = false }: { wide?: boolean }) {
  return (
    <section
      aria-label="Payment security and company details"
      className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Lock className="size-4 text-accent" aria-hidden="true" />
        Your payment is secure
      </h2>

      <ul
        className={
          wide
            ? "mt-3 grid gap-x-8 gap-y-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3"
            : "mt-4 space-y-3 text-sm text-muted-foreground"
        }
      >
        <li className="flex items-start gap-3">
          <CreditCard className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>
            You pay on Stripe&apos;s secure page. We never see or store your card details.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>
            Stripe is certified to PCI DSS Level 1, the highest standard for card payments.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>Your connection is encrypted with HTTPS.</span>
        </li>
        <li className="flex items-start gap-3">
          <FileText className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>
            We handle your details under the Australian Privacy Principles. Read our{" "}
            <a
              href="/privacy-policy.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              Privacy Policy
            </a>{" "}
            and{" "}
            <a
              href="/terms-of-business.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              Terms of Business
            </a>
            .
          </span>
        </li>
        <li className="flex items-start gap-3">
          <Building2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>You Mimic Pty Ltd, ABN 39 695 563 627. Offices in Hobart and Brisbane.</span>
        </li>
        <li className="flex items-start gap-3">
          <Mail className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>
            Questions before you pay? Email{" "}
            <a href={`mailto:${SALES_EMAIL}`} className={linkClass}>
              {SALES_EMAIL}
            </a>
            .
          </span>
        </li>
      </ul>
    </section>
  );
}
