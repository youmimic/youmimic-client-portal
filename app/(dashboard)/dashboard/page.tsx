import { auth } from "@/auth";

export const metadata = {
  title: "Dashboard — YouMimic Portal",
};

export default async function DashboardPage() {
  const session = await auth();
  const displayName = session?.user?.name ?? session?.user?.email ?? "there";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {displayName}.</p>
      </div>
    </div>
  );
}
