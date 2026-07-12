// components/invite/invite-status-cards.tsx
import Link from "next/link";
import { ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="container mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 py-10">
      <Card className="w-full">{children}</Card>
    </main>
  );
}

export function InvalidInviteCard() {
  return (
    <InviteShell>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-xl">Invite not found</CardTitle>
        </div>
        <CardDescription>
          This invite link is invalid or no longer available.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to login</Link>
        </Button>
      </CardContent>
    </InviteShell>
  );
}

export function AlreadyHandledCard() {
  return (
    <InviteShell>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-xl">Invite no longer active</CardTitle>
        </div>
        <CardDescription>
          This invite has already been used or is no longer active.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </CardContent>
    </InviteShell>
  );
}
