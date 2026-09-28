"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LegalAcceptanceField } from "@/components/legal/legal-acceptance-field";

// Every account, regardless of how it was created, lands here once (via
// proxy.ts's requireAcceptedLegal gate) if it has no persisted acceptance
// on record — self-signup and guest checkout already collect this at
// creation time, so in practice this mostly catches admin-created accounts
// and any pre-existing account from before this check existed.
export function AcceptTermsForm({ next }: { next: string }) {
  const router = useRouter();
  const { update } = useSession();

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptTerms: true, acceptPrivacyPolicy: true }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Something went wrong. Please try again.");
      }
      // Refreshes the JWT with the new hasAcceptedLegal value so the redirect
      // target's own proxy check passes immediately, without a fresh login.
      await update();
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const bothAccepted = acceptedTerms && acceptedPrivacy;

  return (
    <main className="container mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <CardTitle className="text-xl">One more step</CardTitle>
          </div>
          <CardDescription>
            Please review and accept the Terms and Conditions and Privacy Policy to continue.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <LegalAcceptanceField
            label="Terms and Conditions"
            fileUrl="/terms-of-business.pdf"
            accepted={acceptedTerms}
            onAccept={() => setAcceptedTerms(true)}
          />
          <LegalAcceptanceField
            label="Privacy Policy"
            fileUrl="/privacy-policy.pdf"
            accepted={acceptedPrivacy}
            onAccept={() => setAcceptedPrivacy(true)}
          />

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={!bothAccepted || submitting}
            onClick={handleContinue}
          >
            {submitting ? "Continuing…" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
