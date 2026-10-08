import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, MessageCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resolveWacrmAppUrl } from "@/lib/wacrm-app-url";
import { WacrmDestinationAssignments } from "@/components/wacrm-destination-assignments";
import { createWacrmContactMatchHandoffFn } from "@/lib/wacrm-contact-match";
import { createWacrmBridgeTokenFn } from "@/lib/wacrm-bridge";

export function WacrmWorkspace({
  contact,
  conversationId,
  matchTarget,
  showAssignmentControls = true,
}: {
  contact?: string;
  conversationId?: string;
  matchTarget?: { recordType: "lead" | "customer"; recordId: string };
  showAssignmentControls?: boolean;
}) {
  const signInToWacrm = useServerFn(createWacrmBridgeTokenFn);
  const signInHandoff = useMutation({
    retry: false,
    mutationFn: () => signInToWacrm(),
  });
  const { mutate: startSignInHandoff } = signInHandoff;
  const createMatchHandoff = useServerFn(createWacrmContactMatchHandoffFn);
  const matchHandoff = useQuery({
    queryKey: ["wacrm-contact-match-handoff", matchTarget?.recordType, matchTarget?.recordId],
    enabled: Boolean(matchTarget),
    queryFn: () => {
      if (!matchTarget) throw new Error("Choose a lead or customer to find a conversation.");
      return createMatchHandoff({ data: matchTarget });
    },
  });
  const wacrmAppUrl = resolveWacrmAppUrl(
    import.meta.env["VITE_WACRM_APP_URL"],
    import.meta.env.DEV,
  );
  const wacrmUrl = wacrmAppUrl?.toString() ?? null;
  const wacrmOrigin = wacrmAppUrl?.origin ?? null;
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [handoffSubmitted, setHandoffSubmitted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const signInFormRef = useRef<HTMLFormElement>(null);
  const submittedTokenRef = useRef<string | null>(null);
  const handoffTargetRef = useRef<string | null>(null);
  const contactId =
    contact && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contact)
      ? contact
      : null;
  const destination = contactId
    ? `/contacts?contact=${encodeURIComponent(contactId)}`
    : conversationId
      ? `/inbox?c=${encodeURIComponent(conversationId)}`
      : "/inbox";
  const initialUrl = (() => {
    if (!wacrmUrl) return undefined;
    if (matchTarget) {
      const handoff = matchHandoff.data;
      if (!handoff) return undefined;
      const matchDestination = new URL("/inbox", wacrmUrl);
      matchDestination.searchParams.set("crm_match_token", handoff.token);
      matchDestination.searchParams.set("crm_match_issuer", handoff.issuer);
      return matchDestination.toString();
    }
    return new URL(destination, wacrmUrl).toString();
  })();
  const signInUrl = wacrmUrl ? new URL("/auth/bridge", wacrmUrl).toString() : undefined;
  const handoffDestination = (() => {
    if (!initialUrl || !wacrmOrigin) return destination;
    const target = new URL(initialUrl);
    return target.origin === wacrmOrigin
      ? `${target.pathname}${target.search}${target.hash}`
      : destination;
  })();

  useEffect(() => {
    if (
      !initialUrl ||
      handoffTargetRef.current === initialUrl ||
      signInHandoff.isPending ||
      signInHandoff.isError
    ) {
      return;
    }
    handoffTargetRef.current = initialUrl;
    startSignInHandoff();
  }, [initialUrl, signInHandoff.isError, signInHandoff.isPending, startSignInHandoff]);

  useEffect(() => {
    const token = signInHandoff.data?.token;
    if (!token || !signInUrl || !frameReady || submittedTokenRef.current === token) return;
    submittedTokenRef.current = token;
    setHandoffSubmitted(true);
    signInFormRef.current?.requestSubmit();
  }, [frameReady, signInHandoff.data?.token, signInUrl]);

  useEffect(() => {
    if (!handoffSubmitted || frameLoaded) return;
    const timeout = window.setTimeout(() => {
      setConnectionFailed(true);
    }, 20000);
    return () => window.clearTimeout(timeout);
  }, [frameLoaded, handoffSubmitted, retryCount]);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="relative min-h-0 flex-1">
        {(!frameLoaded || connectionFailed || matchHandoff.isLoading) && wacrmUrl ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background p-6 text-center">
            {matchTarget && matchHandoff.isLoading ? (
              <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
                <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
                <p className="font-medium">Finding the matching WhatsApp conversation…</p>
              </div>
            ) : matchHandoff.isError ? (
              <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Could not find the conversation</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {matchHandoff.error instanceof Error
                    ? matchHandoff.error.message
                    : "WACRM contact matching failed."}
                </p>
                <Button className="mt-5" onClick={() => void matchHandoff.refetch()} type="button">
                  Retry
                </Button>
              </div>
            ) : signInHandoff.isError ? (
              <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Could not connect your WACRM account</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {signInHandoff.error instanceof Error
                    ? signInHandoff.error.message
                    : "The secure sign-in handoff failed."}
                </p>
                <Button
                  className="mt-5"
                  onClick={() => {
                    submittedTokenRef.current = null;
                    handoffTargetRef.current = initialUrl ?? null;
                    setFrameReady(false);
                    setHandoffSubmitted(false);
                    setFrameLoaded(false);
                    setConnectionFailed(false);
                    setRetryCount((count) => count + 1);
                    signInHandoff.reset();
                    startSignInHandoff();
                  }}
                  type="button"
                >
                  Retry connection
                </Button>
              </div>
            ) : connectionFailed ? (
              <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
                <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
                  <MessageCircle className="size-6" aria-hidden="true" />
                </div>
                <h2 className="text-lg font-semibold">WhatsApp is taking longer to load</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  You can retry without leaving the CRM. If this keeps happening, contact your CRM
                  administrator.
                </p>
                <Button
                  className="mt-5"
                  onClick={() => {
                    submittedTokenRef.current = null;
                    handoffTargetRef.current = initialUrl ?? null;
                    setFrameReady(false);
                    setHandoffSubmitted(false);
                    setFrameLoaded(false);
                    setConnectionFailed(false);
                    setRetryCount((count) => count + 1);
                    signInHandoff.reset();
                    startSignInHandoff();
                  }}
                  type="button"
                >
                  <RotateCw aria-hidden="true" />
                  Retry connection
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
                <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
                <div>
                  <p className="font-medium">Opening WhatsApp</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Loading your WhatsApp workspace…
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {wacrmUrl && initialUrl ? (
          <iframe
            key={`${retryCount}:${initialUrl}`}
            name="wacrm-auth-frame"
            title="WACRM WhatsApp CRM"
            src="about:blank"
            onLoad={() => {
              if (!submittedTokenRef.current) {
                setFrameReady(true);
                return;
              }
              setFrameLoaded(true);
              setConnectionFailed(false);
            }}
            className="absolute inset-0 h-full w-full border-0 bg-background"
            allow="microphone"
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="max-w-md rounded-xl border bg-card p-6 shadow-sm">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <MessageCircle className="size-6" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold">WACRM is not configured</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Set VITE_WACRM_APP_URL to the WACRM app’s HTTP(S) URL and restart the CRM.
              </p>
            </div>
          </div>
        )}
        {signInUrl && (
          <form
            ref={signInFormRef}
            action={signInUrl}
            method="post"
            target="wacrm-auth-frame"
            className="hidden"
          >
            <input type="hidden" name="token" value={signInHandoff.data?.token ?? ""} />
            <input type="hidden" name="next" value={handoffDestination} />
          </form>
        )}
      </div>
      {showAssignmentControls && (
        <div className="flex shrink-0 justify-end border-t bg-background px-3 py-1.5">
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                Assign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[min(96vw,1100px)] max-w-5xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Assign destinations</DialogTitle>
                <DialogDescription>
                  Choose the active employee and latest active PDF used for each WhatsApp
                  destination.
                </DialogDescription>
              </DialogHeader>
              <WacrmDestinationAssignments />
            </DialogContent>
          </Dialog>
        </div>
      )}
    </section>
  );
}
