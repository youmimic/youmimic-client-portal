import { NextResponse } from "next/server";
import { auth } from "@/auth";
import stripeClient from "@/lib/stripe";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await params;

  // Fetch the payment and its subscription ownership in one query.
  const payment = await prisma.payment.findUnique({
    where: { stripeInvoiceId: invoiceId },
    select: {
      stripeInvoiceId: true,
      subscription: {
        select: {
          userId: true,
          enterprise: {
            select: { ownerUserId: true },
          },
        },
      },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Allow personal subscription owner or enterprise subscription owner.
  const userId = session.user.id;
  const isOwner =
    payment.subscription?.userId === userId ||
    payment.subscription?.enterprise?.ownerUserId === userId;

  if (!isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Retrieve the Stripe-hosted invoice URL. This is available on finalised
  // invoices; draft or zero-amount invoices may return null.
  const invoice = await stripeClient.invoices.retrieve(invoiceId);
  const hostedUrl = invoice.hosted_invoice_url;

  if (!hostedUrl) {
    return NextResponse.json(
      { error: "Receipt URL not available for this invoice" },
      { status: 404 },
    );
  }

  return NextResponse.redirect(hostedUrl);
}
