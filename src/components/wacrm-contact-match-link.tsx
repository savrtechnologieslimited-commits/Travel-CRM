import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { matchWacrmContactFn } from "@/lib/wacrm-contact-match";
import { resolveWacrmAppUrl } from "@/lib/wacrm-app-url";
import { Button } from "@/components/ui/button";

type WacrmContactMatchLinkProps = {
  recordType: "lead" | "customer";
  recordId: string;
};

export function WacrmContactMatchLink({ recordType, recordId }: WacrmContactMatchLinkProps) {
  const { mutate, reset, data, error, isPending } = useMutation({
    mutationFn: (record: WacrmContactMatchLinkProps) => matchWacrmContactFn({ data: record }),
  });
  const requestedRecord = useRef<string | null>(null);

  useEffect(() => {
    const key = `${recordType}:${recordId}`;
    if (requestedRecord.current === key) return;
    requestedRecord.current = key;
    reset();
    mutate({ recordType, recordId });
  }, [mutate, recordId, recordType, reset]);

  const wacrmAppUrl = resolveWacrmAppUrl(
    import.meta.env["VITE_WACRM_APP_URL"],
    import.meta.env.DEV,
  );
  const contactUrl = wacrmAppUrl ? new URL("/contacts", wacrmAppUrl) : null;

  if (contactUrl && data?.status === "matched") {
    contactUrl.searchParams.set("contact", data.contactId);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-muted-foreground">WACRM contact</span>
      {isPending ? (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Checking for a unique match…
        </span>
      ) : null}
      {data?.status === "matched" && contactUrl ? (
        <Button asChild size="sm" variant="outline">
          <a href={contactUrl.toString()} target="_blank" rel="noreferrer">
            Open linked contact
            <ExternalLink className="size-4" />
          </a>
        </Button>
      ) : null}
      {data?.status === "ambiguous" ? (
        <span role="status" className="text-amber-700">
          {data.candidateCount} contacts match; none were linked.
        </span>
      ) : null}
      {data?.status === "unmatched" ? (
        <span role="status" className="text-muted-foreground">
          No exact contact match found.
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-destructive">
          Could not check WACRM contacts. Sign in to WACRM and try again.
        </span>
      ) : null}
      {contactUrl && data?.status !== "matched" ? (
        <Button asChild size="sm" variant="ghost">
          <a href={contactUrl.toString()} target="_blank" rel="noreferrer">
            Open WACRM contacts
            <ExternalLink className="size-4" />
          </a>
        </Button>
      ) : null}
    </div>
  );
}
