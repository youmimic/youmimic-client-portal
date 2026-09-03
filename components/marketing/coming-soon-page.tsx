import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ComingSoonPage({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-b border-border py-24 sm:py-32">
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{body}</p>
        <Button asChild className="mt-8">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </section>
  );
}
