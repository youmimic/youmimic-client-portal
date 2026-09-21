import { Check, Clock, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type VideoStatus } from "@/lib/video-display";

const STATUS_CLASS: Record<VideoStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  PROCESSING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

// One status pill for every video surface. The icon means state is never
// carried by colour alone.
export function VideoStatusBadge({ status, className }: { status: VideoStatus; className?: string }) {
  const Icon =
    status === "COMPLETED" ? Check : status === "FAILED" ? TriangleAlert : status === "PENDING" ? Clock : Loader2;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_CLASS[status],
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", status === "PROCESSING" && "animate-spin")} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
