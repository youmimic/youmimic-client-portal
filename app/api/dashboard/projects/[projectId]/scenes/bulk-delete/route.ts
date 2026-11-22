import { NextResponse } from "next/server";
import { deleteScenesSchema } from "@/lib/projects/schemas";
import { deleteScenes } from "@/lib/projects/service";
import { errorResponse, readBody, requireUserId } from "@/lib/projects/http";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;

  const body = await readBody(req, deleteScenesSchema);
  if ("response" in body) return body.response;

  try {
    return NextResponse.json(await deleteScenes(userId, projectId, body.data.sceneIds, body.data.expectedVersion));
  } catch (err) {
    return errorResponse(err);
  }
}
