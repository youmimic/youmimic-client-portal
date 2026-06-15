// app/login/page.tsx
import Link from "next/link";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import SignOutButton from "@/components/auth/sign-out-button";
import LoginForm from "./login-form";

function getInitial(name?: string | null, email?: string | null) {
  const value = name?.trim() || email?.trim() || "U";
  return value.charAt(0).toUpperCase();
}

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    const displayName = session.user.name || session.user.email || "User";
    const initial = getInitial(session.user.name, session.user.email);

    return (
      <main className="container mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 py-10">
        <Card className="w-full">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">
              You are already logged in
            </CardTitle>
            <CardDescription>
              Your account is active in this browser session.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                {initial}
              </div>

              <div className="min-w-0">
                <p className="font-medium">{displayName}</p>
                {session.user.email && (
                  <p className="truncate text-sm text-muted-foreground">
                    {session.user.email}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:flex-1">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>

              <SignOutButton />
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <LoginForm />;
}
