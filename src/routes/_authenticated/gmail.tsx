import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Mail,
  RefreshCw,
  Unplug,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { GmailCompose } from "@/components/gmail-compose";
import { SupplierEmailTemplateDialog } from "@/components/supplier-email-template-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  completeGmailOAuth,
  completeZohoMailOAuth,
  disconnectMailAccount,
  fetchGmailInbox,
  fetchGmailThread,
  getConnectedMailAccounts,
  sanitizeGmailHtml,
  startGmailOAuth,
  startZohoMailOAuth,
} from "@/lib/gmail-provider";

type GmailListItem = {
  id: string;
  threadId?: string | null;
  messageId?: string | null;
  fromName: string | null;
  fromEmail: string | null;
  toEmail: string | null;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
};

type GmailThreadMessage = {
  id: string;
  threadId?: string | null;
  fromName: string | null;
  fromEmail: string | null;
  toName: string | null;
  toEmail: string | null;
  subject: string;
  receivedAt: string;
  bodyText: string;
  bodyHtml?: string | null;
};

type MailFolder = "inbox" | "sent";

export const Route = createFileRoute("/_authenticated/gmail")({
  head: () => ({
    meta: [
      { title: "Gmail Inbox — SAVR Travels CRM" },
      {
        name: "description",
        content: "Read the authenticated employee Gmail inbox inside the CRM.",
      },
    ],
  }),
  component: GmailInboxPage,
});

function GmailInboxPage() {
  const startAuthorization = useServerFn(startGmailOAuth);
  const startZohoAuthorization = useServerFn(startZohoMailOAuth);
  const finishGoogleAuthorization = useServerFn(completeGmailOAuth);
  const finishZohoAuthorization = useServerFn(completeZohoMailOAuth);
  const loadMailAccounts = useServerFn(getConnectedMailAccounts);
  const disconnectMail = useServerFn(disconnectMailAccount);
  const loadInbox = useServerFn(fetchGmailInbox);
  const loadThread = useServerFn(fetchGmailThread);

  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [zohoEmail, setZohoEmail] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<"connected" | "error" | null>(null);
  const [zohoStatus, setZohoStatus] = useState<"connected" | "error" | null>(null);
  const [inbox, setInbox] = useState<GmailListItem[]>([]);
  const [mailFolder, setMailFolder] = useState<MailFolder>("inbox");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<GmailThreadMessage[] | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = gmailStatus === "connected";

  const selectedThreadMessage = useMemo(() => {
    if (!selectedThread) return null;
    return (
      selectedThread.find((message) => message.id === selectedMessageId) ??
      selectedThread[selectedThread.length - 1] ??
      null
    );
  }, [selectedMessageId, selectedThread]);

  async function refreshConnection({ clearError = true }: { clearError?: boolean } = {}) {
    if (clearError) setError(null);
    let accounts: Array<{ provider: string; email: string; status: string }>;
    try {
      accounts = await loadMailAccounts({ data: undefined });
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : "Unable to load mail connections.",
      );
      return;
    }
    const gmailConnection = accounts.find((account) => account.provider === "gmail");
    const zohoConnection = accounts.find((account) => account.provider === "zoho");
    const connectedGmail = gmailConnection?.email ?? null;
    setGmailEmail(connectedGmail);
    setGmailStatus(
      gmailConnection?.status === "error" ? "error" : gmailConnection ? "connected" : null,
    );
    setZohoEmail(zohoConnection?.email ?? null);
    setZohoStatus(
      zohoConnection?.status === "error" ? "error" : zohoConnection ? "connected" : null,
    );
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) return;
    if (gmailConnection?.status === "connected" && connectedGmail) {
      void loadInboxList(undefined, true, mailFolder);
    } else {
      setInbox([]);
      setSelectedThread(null);
    }

    if (gmailConnection?.status === "error") {
      setError("Gmail authorization expired or invalid");
    }
  }

  async function loadInboxList(pageToken?: string, force = false, folder: MailFolder = mailFolder) {
    if (!connected && !force) return;
    setLoadingInbox(true);
    setError(null);
    try {
      const result = await loadInbox({
        data: {
          maxResults: 20,
          folder,
          ...(pageToken ? { pageToken } : {}),
        },
      });
      if (!result) throw new Error(`Gmail ${folder} is unavailable.`);
      setInbox((current) => (pageToken ? [...current, ...result.messages] : result.messages));
      setNextPageToken(result.nextPageToken ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gmail API request failed.");
    } finally {
      setLoadingInbox(false);
    }
  }

  async function openMessage(threadId: string, messageId: string) {
    setSelectedMessageId(messageId);
    setSelectedThread(null);
    setLoadingThread(true);
    setError(null);
    try {
      const result = await loadThread({ data: { threadId } });
      const threadMessages = (result?.thread?.messages ?? []) as unknown[] as Array<
        Partial<GmailThreadMessage>
      >;
      const normalizedThread = threadMessages.map((message) => ({
        id: message.id ?? threadId,
        threadId: message.threadId ?? threadId,
        fromName: message.fromName ?? null,
        fromEmail: message.fromEmail ?? null,
        toName: message.toName ?? null,
        toEmail: message.toEmail ?? null,
        subject: message.subject ?? "(no subject)",
        receivedAt: message.receivedAt ?? new Date().toISOString(),
        bodyText: message.bodyText ?? "",
        bodyHtml: message.bodyHtml ?? null,
      }));
      if (!normalizedThread.length) {
        setSelectedThread([]);
        return;
      }
      setSelectedThread(normalizedThread as GmailThreadMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the selected Gmail message.");
    } finally {
      setLoadingThread(false);
    }
  }

  useEffect(() => {
    async function processOAuthCallback() {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("code") && !params.has("error")) {
        await refreshConnection();
        return;
      }

      const state = params.get("state");
      const provider =
        state && sessionStorage.getItem("mail-oauth-state:gmail") === state
          ? "gmail"
          : state && sessionStorage.getItem("mail-oauth-state:zoho") === state
            ? "zoho"
            : null;
      window.history.replaceState({}, "", window.location.pathname);
      if (!provider) {
        setError("Mail authorization state did not match. Start the connection again.");
        return;
      }
      sessionStorage.removeItem(`mail-oauth-state:${provider}`);
      let callbackErrorMessage: string | null = null;
      try {
        const code = params.get("code");
        const authorizationError = params.get("error");
        const callbackData = {
          redirectUri: `${window.location.origin}/gmail`,
          ...(code ? { code } : {}),
          ...(state ? { state } : {}),
          ...(authorizationError ? { error: authorizationError } : {}),
        };
        if (provider === "gmail") await finishGoogleAuthorization({ data: callbackData });
        else await finishZohoAuthorization({ data: callbackData });
        setError(null);
      } catch (callbackError) {
        callbackErrorMessage =
          callbackError instanceof Error
            ? callbackError.message
            : "Mail provider authorization failed.";
        setError(callbackErrorMessage);
      }
      await refreshConnection({ clearError: false });
      if (callbackErrorMessage) setError(callbackErrorMessage);
    }

    void processOAuthCallback();
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const result = await startAuthorization({
        data: { redirectUri: `${window.location.origin}/gmail` },
      });
      sessionStorage.setItem("mail-oauth-state:gmail", result.state);
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to begin Gmail authorization.");
      setConnecting(false);
    }
  }

  async function handleConnectZoho() {
    setConnecting(true);
    setError(null);
    try {
      const result = await startZohoAuthorization({
        data: { redirectUri: `${window.location.origin}/gmail` },
      });
      sessionStorage.setItem("mail-oauth-state:zoho", result.state);
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to begin Zoho Mail authorization.");
      setConnecting(false);
    }
  }

  async function handleDisconnect(provider: "gmail" | "zoho") {
    setDisconnecting(true);
    setError(null);
    try {
      await disconnectMail({ data: { provider } });
      if (provider === "gmail") {
        setGmailEmail(null);
        setGmailStatus(null);
        setInbox([]);
        setSelectedThread(null);
        setSelectedMessageId(null);
      } else {
        setZohoEmail(null);
        setZohoStatus(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Unable to disconnect ${provider === "gmail" ? "Gmail" : "Zoho Mail"}.`,
      );
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mail Accounts"
        subtitle="Connect Gmail or Zoho Mail to send supplier enquiries directly from the CRM. Gmail also provides inbox access."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GmailCompose
              disabled={!connected}
              onSent={() => {
                setMailFolder("sent");
                setSelectedMessageId(null);
                setSelectedThread(null);
                void loadInboxList(undefined, true, "sent");
              }}
            />
            <SupplierEmailTemplateDialog />
            {!gmailEmail && (
              <Button size="sm" onClick={handleConnect} disabled={connecting}>
                <Mail className="mr-2 size-4" /> {connecting ? "Connecting..." : "Connect Gmail"}
              </Button>
            )}
            {!zohoEmail && (
              <Button variant="outline" size="sm" onClick={handleConnectZoho} disabled={connecting}>
                <Mail className="mr-2 size-4" />{" "}
                {connecting ? "Connecting..." : "Connect Zoho Mail"}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {(["gmail", "zoho"] as const).map((provider) => {
          const email = provider === "gmail" ? gmailEmail : zohoEmail;
          const status = provider === "gmail" ? gmailStatus : zohoStatus;
          const isError = status === "error";
          return (
            <Card key={provider} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {provider === "gmail" ? "Gmail" : "Zoho Mail"}
                  </p>
                  <p className="truncate text-sm font-medium">{email ?? "Not connected"}</p>
                </div>
                {isError ? (
                  <Badge variant="destructive">Error</Badge>
                ) : email ? (
                  <Badge variant="secondary">Connected</Badge>
                ) : null}
              </div>
              {(email || isError) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDisconnect(provider)}
                  disabled={disconnecting}
                >
                  <Unplug className="mr-2 size-4" /> Disconnect
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4" />
            <span>{error}</span>
          </div>
        </Card>
      )}

      {!connected ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {zohoEmail
            ? "Zoho Mail is connected and ready to send supplier enquiries. Connect Gmail to view an inbox inside the CRM."
            : "Connect Gmail to load the inbox and send mail, or connect Zoho Mail to send supplier enquiries."}
        </Card>
      ) : selectedMessageId ? (
        <Card className="p-4">
          <div className="mb-4 border-b pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedMessageId(null);
                setSelectedThread(null);
                setError(null);
              }}
              aria-label={`Back to ${mailFolder}`}
            >
              <ArrowLeft className="size-4" />
              Back to {mailFolder}
            </Button>
          </div>
          {loadingThread ? (
            <div className="p-4 text-sm text-muted-foreground">Loading selected email…</div>
          ) : selectedThreadMessage ? (
            <div className="space-y-5">
              <div className="space-y-2 border-b pb-4">
                <h2 className="text-lg font-semibold">{selectedThreadMessage.subject}</h2>
                <p className="text-sm font-medium">
                  {selectedThreadMessage.fromName ??
                    selectedThreadMessage.fromEmail ??
                    "Unknown sender"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedThreadMessage.fromEmail ?? "Unknown email"}
                </p>
                <p className="text-xs text-muted-foreground">
                  To:{" "}
                  {selectedThreadMessage.toEmail ?? selectedThreadMessage.toName ?? "Not available"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(selectedThreadMessage.receivedAt).toLocaleString()}
                </p>
              </div>

              <div className="space-y-4">
                {selectedThread?.map((message) => (
                  <div key={message.id} className="rounded-md border bg-muted/30 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{message.fromName ?? message.fromEmail ?? "Unknown sender"}</span>
                      <span>{new Date(message.receivedAt).toLocaleString()}</span>
                    </div>
                    <div className="space-y-3 text-sm">
                      {message.bodyHtml ? (
                        <iframe
                          title={`Email message from ${message.fromName ?? message.fromEmail ?? "unknown sender"}`}
                          sandbox=""
                          srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;font-family:Arial,sans-serif}body{overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${sanitizeGmailHtml(message.bodyHtml)}</body></html>`}
                          className="min-h-[420px] w-full bg-white sm:h-[65vh] sm:max-h-[720px]"
                        />
                      ) : (
                        <p className="whitespace-pre-wrap">
                          {message.bodyText || "No readable email body was returned by Gmail."}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">Unable to display this email.</div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b p-3">
              <Tabs
                value={mailFolder}
                onValueChange={(value) => {
                  const folder: MailFolder = value === "sent" ? "sent" : "inbox";
                  setMailFolder(folder);
                  setInbox([]);
                  setNextPageToken(null);
                  void loadInboxList(undefined, false, folder);
                }}
              >
                <TabsList>
                  <TabsTrigger value="inbox">Inbox</TabsTrigger>
                  <TabsTrigger value="sent">Sent</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void loadInboxList()}
                aria-label={`Refresh ${mailFolder}`}
              >
                <RefreshCw className={`size-4 ${loadingInbox ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {loadingInbox && !inbox.length ? (
              <div className="p-4 text-sm text-muted-foreground">Loading {mailFolder}…</div>
            ) : inbox.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                {mailFolder === "sent" ? "No sent emails." : "Inbox is empty."}
              </div>
            ) : (
              <div className="max-h-[72vh] overflow-y-auto">
                {inbox.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => void openMessage(message.threadId ?? message.id, message.id)}
                    className={`w-full border-b p-3 text-left transition ${selectedMessageId === message.id ? "bg-muted" : "hover:bg-muted/50"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">
                        {mailFolder === "sent"
                          ? (message.toEmail ?? "Recipient unavailable")
                          : (message.fromName ?? message.fromEmail ?? "Unknown sender")}
                      </span>
                      {message.unread && <Badge className="ml-auto">New</Badge>}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{message.subject}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {message.preview}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {mailFolder === "sent"
                          ? `To: ${message.toEmail ?? "Unknown recipient"}`
                          : (message.fromEmail ?? "Unknown email")}
                      </span>
                      <span>{new Date(message.receivedAt).toLocaleString()}</span>
                    </div>
                  </button>
                ))}

                {nextPageToken && (
                  <div className="p-3">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => void loadInboxList(nextPageToken)}
                    >
                      <ChevronLeft className="mr-2 size-4" /> Load more{" "}
                      <ChevronRight className="ml-2 size-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
