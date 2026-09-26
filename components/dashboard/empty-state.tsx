import type { ComponentType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

// Consistent "nothing here yet" block: an icon, a plain sentence about what
// will appear, and the next step if there is one.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardContent className={compact ? "flex flex-col items-start gap-3 py-6" : "flex flex-col items-start gap-4 py-10"}>
        <Icon className="h-9 w-9 text-muted-foreground/50" aria-hidden="true" />
        <div>
          <p className="text-base font-medium">{title}</p>
          {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
