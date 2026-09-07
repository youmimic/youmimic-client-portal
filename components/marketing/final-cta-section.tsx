import Link from "next/link";
import { Button } from "@/components/ui/button";

// Shared login-aware closing CTA — previously hand-duplicated (byte-for-byte
// identical) at the bottom of both the homepage and /pricing. Extracted so
// a copy/palette/contrast fix (like the WCAG darkening layer below) only
// has to happen once.
export function FinalCtaSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section
      className="relative overflow-hidden py-16 sm:py-20"
      style={{ backgroundColor: "#4C9997" }}
    >
      {/* Uniform darkening layer — the flat #4C9997 background alone
          doesn't give white text enough contrast to clear WCAG AA
          (~2.9:1 for the subhead, ~3.4:1 for solid white); this brings
          both comfortably above 4.5:1. Layered under the decorative
          radial glows below, which stay purely cosmetic. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: "rgba(0,0,0,0.18)" }}
      />
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
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ color: "#FFFFFF" }}
        >
          {isLoggedIn
            ? "Ready to make your next AI avatar video?"
            : "Ready to create your first AI avatar?"}
        </h2>
        <p
          className="mx-auto mt-3 max-w-sm text-base leading-relaxed"
          style={{ color: "#FFFFFF" }}
        >
          {isLoggedIn
            ? "Jump back into your dashboard and keep going."
            : "Make professional videos without a production crew."}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {isLoggedIn ? (
            <Button
              asChild
              className="h-12 px-8 text-base font-medium"
              style={{
                backgroundColor: "#FFFFFF",
                color: "#4C9997",
                borderColor: "#FFFFFF",
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
                  borderColor: "#FFFFFF",
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
  );
}
