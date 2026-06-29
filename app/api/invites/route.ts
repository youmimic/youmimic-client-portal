import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { inviteSchema } from "@/lib/validations/invite";
import { sendInviteEmail } from "@/lib/mailer";

const MEMBER_ROLE_NAME = "member";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enterprise = await prisma.enterprise.findFirst({
    where: { ownerUserId: session.user.id },
    select: { id: true, name: true },
  });

  if (!enterprise) {
    return NextResponse.json(
      { error: "Only enterprise owners can send invites" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid email address",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { email } = parsed.data;

  const existing = await prisma.invite.findFirst({
    where: { enterpriseId: enterprise.id, email, status: "pending" },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      {
        error: "An invite is already pending for this email address",
        fieldErrors: {
          email: ["An invite is already pending for this email address"],
        },
      },
      { status: 409 },
    );
  }

  const memberRole = await prisma.role.upsert({
    where: { name: MEMBER_ROLE_NAME },
    create: { name: MEMBER_ROLE_NAME },
    update: {},
    select: { id: true },
  });

  const token = crypto.randomUUID();
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const acceptUrl = `${baseUrl}/invite/${token}`;

  const invite = await prisma.invite.create({
    data: {
      enterpriseId: enterprise.id,
      email,
      roleId: memberRole.id,
      token,
      status: "pending",
      invitedById: session.user.id,
    },
    select: { id: true, email: true, createdAt: true },
  });

  try {
    await sendInviteEmail({
      to: email,
      inviterName: session.user.name ?? "A team member",
      enterpriseName: enterprise.name,
      acceptUrl,
      idempotencyKey: `invite/${invite.id}`,
    });
  } catch (err) {
    console.error("Invite email failed:", err);
  }

  revalidatePath("/dashboard/settings");

  return NextResponse.json({ invite }, { status: 201 });
}
