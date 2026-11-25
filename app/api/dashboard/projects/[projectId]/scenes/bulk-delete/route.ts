import { NextResponse } from "next/server";
import { deleteScenesSchema } from "@/lib/projects/schemas";
import { deleteScenes } from "@/lib/projects/service";
import { errorResponse, readBody, requireUserId } from "@/lib/projects/http";
import { pruneUnusedSlideImagesQuietly } from "@/lib/slides/images";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;

  const body = await readBody(req, deleteScenesSchema);
  if ("response" in body) return body.response;

  try {
    const result = await deleteScenes(userId, projectId, body.data.sceneIds, body.data.expectedVersion);
    await pruneUnusedSlideImagesQuietly(userId);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
