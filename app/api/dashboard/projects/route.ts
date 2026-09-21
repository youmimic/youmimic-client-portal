import { NextResponse } from "next/server";
import { userHasActiveSubscription } from "@/lib/subscription";
import { createProjectSchema } from "@/lib/projects/schemas";
import { createProject } from "@/lib/projects/service";
import { errorResponse, readBody, requireUserId } from "@/lib/projects/http";

// Starts a draft multi-scene project with one blank scene.
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  if (!(await userHasActiveSubscription(userId))) {
    return NextResponse.json({ error: "An active subscription is required to create videos." }, { status: 403 });
  }

  const body = await readBody(req, createProjectSchema);
  if ("response" in body) return body.response;

  try {
    const project = await createProject(userId, body.data);
    return NextResponse.json({ projectId: project.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
