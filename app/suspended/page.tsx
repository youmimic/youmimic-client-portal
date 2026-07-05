import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import SignOutButton from "@/components/auth/sign-out-button";

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "sales@youmimic.com";

export const metadata = {
  title: "Account Suspended — YouMimic Portal",
};

export default function SuspendedPage() {
  return (
    <main className="container mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-destructive" />
            <CardTitle className="text-xl">Account suspended</CardTitle>
          </div>
          <CardDescription>
            Your account has been suspended and you cannot access the portal at
            this time.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If you believe this is an error or would like to appeal, please
            contact us at{" "}
            <a
              href={`mailto:${SALES_EMAIL}`}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {SALES_EMAIL}
            </a>
            .
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <SignOutButton />
            <Button asChild variant="outline" className="w-full sm:flex-1">
              <Link href="/login">Back to login</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
