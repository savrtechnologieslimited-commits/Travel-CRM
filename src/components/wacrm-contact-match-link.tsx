import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { createWacrmContactMatchHandoffFn } from "@/lib/wacrm-contact-match";
import { Button } from "@/components/ui/button";

type WacrmContactMatchLinkProps = {
  recordType: "lead" | "customer";
  recordId: string;
};

export function WacrmContactMatchLink({ recordType, recordId }: WacrmContactMatchLinkProps) {
  const [popupError, setPopupError] = useState<string | null>(null);
  const { mutateAsync, error, isPending } = useMutation({
    mutationFn: (record: WacrmContactMatchLinkProps) =>
      createWacrmContactMatchHandoffFn({ data: record }),
  });

  async function openMatch() {
    setPopupError(null);
    const target = window.open("about:blank", "_blank");
    if (!target) {
      setPopupError("Allow pop-ups to open WACRM contact matching.");
      return;
    }
    try {
      const result = await mutateAsync({ recordType, recordId });
      target.location.href = result.url;
    } catch {
      target.close();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-muted-foreground">WACRM contact</span>
      <span className="text-muted-foreground">
        Find the conversation by phone in the currently signed-in WACRM account.
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void openMatch()}
        disabled={isPending}
      >
        {isPending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <ExternalLink className="size-4" />
        )}
        {isPending ? "Opening WACRM…" : "Find conversation"}
      </Button>
      {error ? (
        <span role="alert" className="text-destructive">
          {error instanceof Error ? error.message : "Could not open WACRM contact matching."}
        </span>
      ) : null}
      {popupError ? (
        <span role="alert" className="text-destructive">
          {popupError}
        </span>
      ) : null}
    </div>
  );
}
