import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircle, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { matchWacrmContactFn } from "@/lib/wacrm-contact-match";

type WacrmCustomerChatButtonProps = {
  customerId: string;
};

export function WacrmCustomerChatButton({ customerId }: WacrmCustomerChatButtonProps) {
  const navigate = useNavigate();
  const openChat = useMutation({
    mutationFn: () =>
      matchWacrmContactFn({
        data: { recordType: "customer", recordId: customerId },
      }),
    onSuccess: async (result) => {
      if (result.status === "matched") {
        await navigate({
          to: "/wacrm",
          search: {
            contact: result.contactId,
            conversationId: undefined,
            matchType: undefined,
            matchId: undefined,
          },
        });
        return;
      }

      toast.error(
        result.status === "ambiguous"
          ? `${result.candidateCount} WACRM contacts match this customer. Review the contact before opening a chat.`
          : "No matching WACRM contact or conversation was found.",
      );
    },
    onError: (error) => {
      console.error("Could not open the WACRM customer conversation:", error);
      toast.error("Could not open this customer's WACRM conversation.");
    },
  });

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      title="Open WACRM chat history"
      aria-label="Open WACRM chat history"
      disabled={openChat.isPending}
      onClick={() => openChat.mutate()}
    >
      {openChat.isPending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <MessageSquareText className="size-4" />
      )}
    </Button>
  );
}
