import { cn } from "@/lib/utils";
import { statusTone, titleize } from "@/lib/crm";

const TONES: Record<string, string> = {
  success: "bg-success/12 text-success border-success/25",
  destructive: "bg-destructive/12 text-destructive border-destructive/25",
  warning: "bg-warning/18 text-warning-foreground border-warning/35",
  info: "bg-info/12 text-info border-info/25",
  muted: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const tone = TONES[statusTone(status)] ?? TONES["muted"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      {titleize(status)}
    </span>
  );
}

const PRIORITY: Record<string, string> = {
  urgent: "bg-destructive/12 text-destructive border-destructive/25",
  high: "bg-warning/18 text-warning-foreground border-warning/35",
  medium: "bg-info/12 text-info border-info/25",
  low: "bg-muted text-muted-foreground border-border",
};

export function PriorityBadge({ priority }: { priority?: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        PRIORITY[priority ?? "low"] ?? PRIORITY["low"],
      )}
    >
      {titleize(priority)}
    </span>
  );
}
