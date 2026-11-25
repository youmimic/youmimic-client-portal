import { NextResponse } from "next/server";
import { setScenesPresentationSchema } from "@/lib/projects/schemas";
import { setScenesPresentation } from "@/lib/projects/service";
import { errorResponse, readBody, requireUserId } from "@/lib/projects/http";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;

  const body = await readBody(req, setScenesPresentationSchema);
  if ("response" in body) return body.response;

  try {
    return NextResponse.json(
      await setScenesPresentation(userId, projectId, body.data.sceneIds, body.data.kind, body.data.expectedVersion),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
