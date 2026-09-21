import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProjectWorkspace } from "@/components/dashboard/project/project-workspace";
import { getProjectView, listAvatarOptions, ProjectError } from "@/lib/projects/service";

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

  const avatars = await listAvatarOptions(session.user.id);

  return <ProjectWorkspace initial={project} avatars={avatars} />;
}
