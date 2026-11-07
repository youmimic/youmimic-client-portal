import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProjectWorkspace } from "@/components/dashboard/project/project-workspace";
import { getProjectView, listAvatarOptions, ProjectError } from "@/lib/projects/service";
import { refreshIfInProgress } from "@/lib/heygen/generate-video";

export const metadata = {
  title: "Video project | YouMimic Portal",
};

export const dynamic = "force-dynamic";

export default async function VideoProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { projectId } = await params;

  let project;
  try {
    project = await getProjectView(session.user.id, projectId);
  } catch (err) {
    if (err instanceof ProjectError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  // Don't show a stale PENDING/PROCESSING status just because nobody's
  // actively watching this page — see refreshIfInProgress's own comment.
  if (project.finalVideo) {
    await refreshIfInProgress(project.finalVideo, session.user.id);
    if (project.finalVideo.status === "PENDING" || project.finalVideo.status === "PROCESSING") {
      try {
        project = await getProjectView(session.user.id, projectId);
      } catch (err) {
        if (!(err instanceof ProjectError && err.code === "NOT_FOUND")) throw err;
      }
    }
  }

  const avatars = await listAvatarOptions(session.user.id);

  return (
    <ProjectWorkspace
      initial={project}
      avatars={avatars}
      canViewCost={!!session.user.adminRole && !session.user.clientModeEnabled}
    />
  );
}
