import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const isGated = reason === "subscription-required";

  return (
    <section className="container mx-auto max-w-5xl px-4 py-16">
      {isGated && (
        <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          An active subscription is required to access that feature. Choose a
          plan below to continue.
        </div>
      )}

      <div className="mb-12 space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Choose your plan</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Get started with YouMimic today. Scale as you grow.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Free</CardTitle>
            <CardDescription>Get started for free</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">$0</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No credit card required
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="ring-2 ring-primary">
          <CardHeader>
            <CardTitle>Creator</CardTitle>
            <CardDescription>For individual creators</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">Contact us</p>
            <p className="mt-1 text-sm text-muted-foreground">Per month</p>
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full">
              <Link href="/signup">Get started</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enterprise</CardTitle>
            <CardDescription>For teams and organisations</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">Custom</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Volume pricing available
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href="/signup">Talk to sales</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}
