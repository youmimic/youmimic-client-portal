import { NextResponse } from "next/server";
import { updateProjectSchema } from "@/lib/projects/schemas";
import { deleteProject, getProjectView, updateProject } from "@/lib/projects/service";
import { errorResponse, readBody, requireUserId } from "@/lib/projects/http";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;
  try {
    return NextResponse.json(await getProjectView(userId, projectId));
  } catch (err) {
    return errorResponse(err);
  }
}

// Project title, output settings and default avatar/voice.
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;

  const body = await readBody(req, updateProjectSchema);
  if ("response" in body) return body.response;

  try {
    return NextResponse.json(await updateProject(userId, projectId, body.data));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;
  try {
    await deleteProject(userId, projectId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
