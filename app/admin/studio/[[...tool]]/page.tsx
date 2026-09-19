import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageContent } from "@/lib/admin/rbac";
import { StudioClient } from "./studio-client";

// NOT force-static: this page calls auth() and needs a real session on
// every request. force-static would prerender it once at build time with
// no session available, permanently baking in the "no adminRole" redirect
// for every visitor regardless of who's actually logged in — exactly the
// bug that shipped here initially.
export const dynamic = "force-dynamic";

// Lives at app/admin/studio (a plain folder, not the app/(admin) route
// group) so the URL is /admin/studio without inheriting AdminShell's
// sidebar layout — Sanity Studio is a full-viewport SPA-style tool with its
// own toolbar/panels, and squeezing it into a sidebar shell would visually
// break it. Gated the same way every app/(admin) page gates itself, just
// done here directly since this route doesn't share that layout. Reachable
// from the admin sidebar (components/admin/admin-shell.tsx) so it's still
// "part of the admin portal" from a navigation standpoint, and also
// inherits proxy.ts's blanket /admin-prefix adminRole check for free.
export default async function StudioPage() {
  const session = await auth();
  if (!session?.user?.adminRole) redirect("/dashboard");

  const actorRole = session.user.adminRole as AdminRole;
  if (!canManageContent(actorRole)) redirect("/admin");

  return <StudioClient />;
}
