import { Check, Loader2, PencilLine, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectStatusValue = "DRAFT" | "GENERATING" | "COMPLETED" | "FAILED";

const LABEL: Record<ProjectStatusValue, string> = {
  DRAFT: "Draft",
  GENERATING: "Generating",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const CLASS: Record<ProjectStatusValue, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  GENERATING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export function ProjectStatusBadge({ status, className }: { status: ProjectStatusValue; className?: string }) {
  const Icon = status === "COMPLETED" ? Check : status === "FAILED" ? TriangleAlert : status === "GENERATING" ? Loader2 : PencilLine;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        CLASS[status],
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", status === "GENERATING" && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
