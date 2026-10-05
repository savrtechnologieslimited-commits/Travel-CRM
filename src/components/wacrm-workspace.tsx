import { useEffect, useState } from "react";
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

export function WacrmWorkspace({ contact }: { contact?: string }) {
  const wacrmAppUrl = resolveWacrmAppUrl(
    import.meta.env["VITE_WACRM_APP_URL"],
    import.meta.env.DEV,
  );
  const wacrmUrl = wacrmAppUrl?.toString() ?? null;
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const contactId =
    contact && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contact)
      ? contact
      : null;
  const destination = contactId ? `/inbox?contact=${encodeURIComponent(contactId)}` : "/dashboard";
  const initialUrl = wacrmUrl ? new URL(destination, wacrmUrl).toString() : undefined;

  useEffect(() => {
    if (!initialUrl) return;
    setConnectionFailed(false);
    if (frameLoaded) return;
    const timeout = window.setTimeout(() => {
      setConnectionFailed(true);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [frameLoaded, initialUrl, retryCount]);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="relative min-h-0 flex-1">
        {(!frameLoaded || connectionFailed) && wacrmUrl ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background p-6 text-center">
            {connectionFailed ? (
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
                    setFrameLoaded(false);
                    setConnectionFailed(false);
                    setRetryCount((count) => count + 1);
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
        {wacrmUrl ? (
          <iframe
            key={retryCount}
            title="WACRM WhatsApp CRM"
            src={initialUrl}
            onLoad={() => {
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
      </div>
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
                Choose the active employee and latest active PDF used for each WhatsApp destination.
              </DialogDescription>
            </DialogHeader>
            <WacrmDestinationAssignments />
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
