import { NextResponse } from "next/server";
import { userHasActiveSubscription } from "@/lib/subscription";
import { duplicateProject } from "@/lib/projects/service";
import { errorResponse, requireUserId } from "@/lib/projects/http";

export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;

  if (!(await userHasActiveSubscription(userId))) {
    return NextResponse.json({ error: "An active subscription is required to create videos." }, { status: 403 });
  }

  try {
    const copy = await duplicateProject(userId, projectId);
    return NextResponse.json({ projectId: copy.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
