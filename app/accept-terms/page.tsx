import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { noIndex } from "@/lib/seo";
import { AcceptTermsForm } from "@/components/legal/accept-terms-form";

export const metadata = {
  title: "Accept terms | YouMimic",
  robots: noIndex,
};

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { next } = await searchParams;
  const target = safeNext(next);

  // Already accepted (e.g. direct navigation here after already accepting)
  // — nothing to do, send them straight on.
  if (session.user.hasAcceptedLegal) redirect(target);

  return (
    <SessionProvider>
      <AcceptTermsForm next={target} />
    </SessionProvider>
  );
}
