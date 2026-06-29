import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { SessionProvider } from "next-auth/react";
import SubscriptionActivator from "./subscription-activator";

export const metadata = { title: "Activating subscription — YouMimic Portal" };

function ActivatingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Activating your subscription…</p>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <SessionProvider>
      <Suspense fallback={<ActivatingState />}>
        <SubscriptionActivator />
      </Suspense>
    </SessionProvider>
  );
}
