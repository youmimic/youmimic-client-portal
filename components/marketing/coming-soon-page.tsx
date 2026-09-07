import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ComingSoonPage({
  title,
  body,
  secondaryCta,
}: {
  title: string;
  body: string;
  secondaryCta?: { href: string; label: string };
}) {
  return (
    <section className="relative overflow-hidden border-b border-border py-24 sm:py-32">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(76,153,151,0.12) 0%, transparent 55%)",
        }}
      />
      <div className="relative z-10 mx-auto max-w-2xl px-4 text-center sm:px-6">
        <h1 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
          {secondaryCta && (
            <Button asChild variant="outline">
              <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
