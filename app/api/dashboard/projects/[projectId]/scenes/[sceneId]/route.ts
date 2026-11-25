import { NextResponse } from "next/server";
import { sceneActionSchema, updateSceneSchema } from "@/lib/projects/schemas";
import { deleteScene, updateScene } from "@/lib/projects/service";
import { errorResponse, readBody, requireUserId } from "@/lib/projects/http";
import { pruneUnusedSlideImagesQuietly } from "@/lib/slides/images";

type Ctx = { params: Promise<{ projectId: string; sceneId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId, sceneId } = await params;

  const body = await readBody(req, updateSceneSchema);
  if ("response" in body) return body.response;

  try {
    const result = await updateScene(userId, projectId, sceneId, body.data);
    // A replaced slide may no longer be shown anywhere.
    if (body.data.slideImageId !== undefined) await pruneUnusedSlideImagesQuietly(userId);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId, sceneId } = await params;

  const body = await readBody(req, sceneActionSchema);
  if ("response" in body) return body.response;

  try {
    const result = await deleteScene(userId, projectId, sceneId, body.data.expectedVersion);
    await pruneUnusedSlideImagesQuietly(userId);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
