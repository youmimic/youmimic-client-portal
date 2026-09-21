import { NextResponse } from "next/server";
import { sceneActionSchema } from "@/lib/projects/schemas";
import { duplicateScene } from "@/lib/projects/service";
import { errorResponse, readBody, requireUserId } from "@/lib/projects/http";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; sceneId: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId, sceneId } = await params;

  const body = await readBody(req, sceneActionSchema);
  if ("response" in body) return body.response;

  try {
    return NextResponse.json(await duplicateScene(userId, projectId, sceneId, body.data.expectedVersion), {
      status: 201,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
