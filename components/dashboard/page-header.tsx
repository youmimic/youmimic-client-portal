import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The title block used at the top of every dashboard page, so headings,
// descriptions and page actions sit in the same place everywhere.
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  // Buttons for the page's main actions. Wraps under the title on small screens.
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-start gap-2">{actions}</div>}
    </div>
  );
}

// A small heading for a block of content inside a page.
export function SectionHeading({
  title,
  action,
  id,
}: {
  title: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-base font-semibold tracking-tight">
        {title}
      </h2>
      {action}
    </div>
  );
}
