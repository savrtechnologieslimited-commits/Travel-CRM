import type { ReactNode } from "react";
import { ExternalLink, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WacrmWorkspace } from "@/components/wacrm-workspace";

type WacrmContactMatchLinkProps = {
  recordType: "lead" | "customer";
  recordId: string;
  trigger?: ReactNode;
  compact?: boolean;
  disabled?: boolean;
  label?: string;
};

export function WacrmContactMatchLink({
  recordType,
  recordId,
  trigger,
  compact = false,
  disabled = false,
  label = "Open WhatsApp chat",
}: WacrmContactMatchLinkProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size={compact ? "icon" : "sm"}
          variant={compact ? "ghost" : "outline"}
          className={compact ? "h-8 w-8 text-slate-600 hover:text-sky-700" : undefined}
          disabled={disabled}
          aria-label={label}
          title={label}
        >
          {trigger ?? (
            <>
              <MessageSquareText className="size-4" />
              {!compact && (
                <>
                  Open WhatsApp chat
                  <ExternalLink className="size-4" />
                </>
              )}
              {compact && <span className="sr-only">Open WhatsApp chat</span>}
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(92vh,900px)] w-[min(96vw,1400px)] max-w-[1400px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-3 text-left">
          <DialogTitle>WhatsApp conversation</DialogTitle>
          <DialogDescription>
            View the conversation in the WhatsApp inbox without leaving this page.
          </DialogDescription>
        </DialogHeader>
        <WacrmWorkspace matchTarget={{ recordType, recordId }} showAssignmentControls={false} />
      </DialogContent>
    </Dialog>
  );
}
