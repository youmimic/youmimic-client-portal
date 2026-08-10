import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
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

  const quickLinks = await prisma.quickLink.findMany({
    orderBy: { order: "asc" },
    select: { id: true, label: true, url: true, isDefault: true },
  });

  return (
    <AdminShell
      user={{
        name: session.user.name,
        email: session.user.email,
        adminRole: session.user.adminRole,
      }}
      quickLinks={quickLinks}
    >
      {children}
    </AdminShell>
  );
}
