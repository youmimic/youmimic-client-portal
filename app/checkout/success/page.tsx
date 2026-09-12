import { redirect } from "next/navigation";
import { ActivationStatus } from "./activation-status";

export const metadata = {
  title: "Setting up your account — YouMimic",
};

// Reached from the guest checkout Stripe Checkout Session's success_url.
// The session_id in the URL is read only to know *which* draft to poll for
// — it is never treated as proof of payment. See ActivationStatus and
// app/api/checkout-draft/status/route.ts: the actual activation decision is
// made exclusively by the Stripe webhook.
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (!session_id) {
    redirect("/pricing");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 items-center justify-center px-4 py-12 sm:px-6">
      <ActivationStatus sessionId={session_id} />
    </div>
  );
}
