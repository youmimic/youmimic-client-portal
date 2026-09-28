import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// Backstop for every account-creation path, not just /signup's own form —
// see proxy.ts's requireAcceptedLegal gate, which sends any signed-in user
// missing either timestamp here regardless of how their account was
// created (self-signup, invite, guest checkout, or admin-created).
const acceptTermsSchema = z.object({
  acceptTerms: z.literal(true),
  acceptPrivacyPolicy: z.literal(true),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = acceptTermsSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "You must accept both the Terms and the Privacy Policy" },
      { status: 422 },
    );
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { termsAcceptedAt: now, privacyPolicyAcceptedAt: now },
  });

  return NextResponse.json({ ok: true });
}
