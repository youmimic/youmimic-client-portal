import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { noIndex } from "@/lib/seo";

export const metadata = {
  title: "Billing setup | YouMimic",
  robots: noIndex,
};

// Public, unauthenticated landing page for the avatar-billing setup Stripe
// Checkout link (lib/stripe/avatar-billing.ts's createAvatarBillingSetupSession)
// — the person completing it is a client contact, not someone with (or
// needing) a YouMimic account. Purely a courtesy landing page: Stripe
// already confirms success on its own hosted page before redirecting here,
// and the real work (creating each avatar's subscription) happens
// asynchronously via the webhook, not anything this page triggers or reads.
export default async function BillingSetupCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { cancelled } = await searchParams;

  return (
    <main className="container mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            {cancelled ? (
              <XCircle className="h-5 w-5 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            )}
            <CardTitle className="text-xl">{cancelled ? "Setup cancelled" : "Payment details saved"}</CardTitle>
          </div>
          <CardDescription>
            {cancelled
              ? "No payment details were saved. If this was a mistake, use the link you were sent again."
              : "Thanks — your billing is being set up now. You don't need to do anything else."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If you have any questions, please contact the person who sent you this link.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
