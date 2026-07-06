import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.adminRole) {
    redirect("/dashboard");
  }

  return (
    <AdminShell
      user={{
        name: session.user.name,
        email: session.user.email,
        adminRole: session.user.adminRole,
      }}
    >
      {children}
    </AdminShell>
  );
}
