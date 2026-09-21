import { NextResponse } from "next/server";
import { addSceneSchema } from "@/lib/projects/schemas";
import { addScene } from "@/lib/projects/service";
import { errorResponse, readBody, requireUserId } from "@/lib/projects/http";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;

  const body = await readBody(req, addSceneSchema);
  if ("response" in body) return body.response;

  try {
    const result = await addScene(userId, projectId, body.data.expectedVersion, body.data.afterSceneId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
