import type { ReactNode } from "react";
import { WacrmConversationDialog } from "@/components/wacrm-conversation-dialog";

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
    <WacrmConversationDialog
      recordType={recordType}
      recordId={recordId}
      trigger={trigger}
      compact={compact}
      disabled={disabled}
      label={label}
    />
  );
}
