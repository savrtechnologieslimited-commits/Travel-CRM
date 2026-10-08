import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CheckCheck, LoaderCircle, MessageCircle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { loadWacrmConversationFn, type WacrmConversationResult } from "@/lib/wacrm-contact-match";

type WacrmContact = WacrmConversationResult["candidates"][number];

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function safeMediaUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function DeliveryStatus({ status }: { status: string }) {
  if (status === "read" || status === "delivered") {
    return <CheckCheck className={status === "read" ? "size-3 text-sky-600" : "size-3"} />;
  }
  if (status === "sent") return <Check className="size-3" />;
  return null;
}

function ConversationTranscript({
  contact,
  conversationId,
  messages,
  historyMayBeLimited,
}: {
  contact: WacrmContact;
  conversationId: string;
  messages: WacrmConversationResult["messages"];
  historyMayBeLimited: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationMessages = messages.filter(
    (message) => message.conversation_id === conversationId,
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversationMessages.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-[#f0f2f5] px-4 py-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
          {(contact.name?.trim().charAt(0) || contact.phone.charAt(0) || "?").toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">
            {contact.name?.trim() || contact.phone}
          </p>
          <p className="truncate text-xs text-slate-600">{contact.phone}</p>
        </div>
        <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs capitalize text-slate-600">
          {contact.conversations.find((item) => item.id === conversationId)?.status ?? "chat"}
        </span>
      </div>

      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efeae2] px-4 py-5 sm:px-8"
        style={{
          backgroundImage: "radial-gradient(rgba(100, 116, 139, .10) 0.7px, transparent 0.7px)",
          backgroundSize: "18px 18px",
        }}
      >
        {conversationMessages.length === 0 ? (
          <div className="mx-auto mt-10 max-w-sm rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-slate-600 shadow-sm">
            No messages are available in this conversation.
          </div>
        ) : (
          conversationMessages.map((message) => {
            const isCustomer = message.sender_type === "customer";
            const mediaUrl = safeMediaUrl(message.media_url);
            const text =
              message.content_text?.trim() ||
              message.template_name ||
              (message.content_type !== "text" ? `${message.content_type} message` : "");

            return (
              <div
                key={message.id}
                className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}
              >
                <article
                  className={`max-w-[88%] rounded-lg px-3 py-2 shadow-sm sm:max-w-[72%] ${
                    isCustomer
                      ? "rounded-tl-sm bg-white text-slate-900"
                      : "rounded-tr-sm bg-[#d9fdd3] text-slate-900"
                  }`}
                >
                  {!isCustomer && message.sender_type === "bot" && (
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                      Automated reply
                    </p>
                  )}
                  {text && (
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {text}
                    </p>
                  )}
                  {mediaUrl && (
                    <a
                      href={mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-800 underline"
                    >
                      View attachment
                    </a>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                    <time dateTime={message.created_at}>
                      {formatMessageTime(message.created_at)}
                    </time>
                    {!isCustomer && <DeliveryStatus status={message.status} />}
                  </div>
                </article>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex shrink-0 items-center justify-center gap-2 border-t bg-[#f0f2f5] px-4 py-2 text-xs text-slate-600">
        <MessageCircle className="size-3.5" />
        {historyMayBeLimited
          ? "Showing up to 1,000 latest messages from WACRM"
          : "Read-only history from WACRM"}
      </div>
    </div>
  );
}

export function WacrmConversationDialog({
  recordType,
  recordId,
  trigger,
  compact = false,
  disabled = false,
  label = "Open WhatsApp chat",
}: {
  recordType: "lead" | "customer";
  recordId: string;
  trigger?: React.ReactNode;
  compact?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const loadWacrmConversation = useServerFn(loadWacrmConversationFn);
  const loadConversation = useMutation({
    retry: false,
    mutationFn: async (): Promise<WacrmConversationResult> => {
      return loadWacrmConversation({
        data: { recordType, recordId },
      });
    },
  });

  const result = loadConversation.data;
  const contactsWithChats =
    result?.candidates.filter((contact) => contact.conversations.length > 0) ?? [];
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const selectedContact =
    contactsWithChats.find((contact) => contact.id === selectedContactId) ??
    (contactsWithChats.length === 1 ? contactsWithChats[0] : null);
  const selectedConversation = selectedContact?.conversations[0];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setSelectedContactId(null);
          loadConversation.mutate();
        } else {
          loadConversation.reset();
        }
      }}
    >
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
              {!compact && <span>WhatsApp chat</span>}
              {compact && <span className="sr-only">Open WhatsApp chat</span>}
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(92vh,900px)] w-[min(96vw,1100px)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-3 text-left">
          <DialogTitle>WhatsApp conversation</DialogTitle>
          <DialogDescription>
            Conversation history is loaded from the signed-in WACRM account.
          </DialogDescription>
        </DialogHeader>

        {loadConversation.isPending ? (
          <div className="grid min-h-0 flex-1 place-items-center">
            <div className="flex items-center gap-3 text-sm text-slate-600" role="status">
              <LoaderCircle className="size-5 animate-spin text-emerald-700" />
              Loading matched chat…
            </div>
          </div>
        ) : loadConversation.isError ? (
          <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
            <div className="max-w-md space-y-3">
              <p className="font-semibold text-slate-900">Could not load the WACRM conversation</p>
              <p className="text-sm text-slate-600">
                {loadConversation.error instanceof Error
                  ? loadConversation.error.message
                  : "Check the WACRM session and allowed CRM origin, then try again."}
              </p>
              <Button type="button" onClick={() => loadConversation.mutate()}>
                Retry
              </Button>
            </div>
          </div>
        ) : result && contactsWithChats.length === 0 ? (
          <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
            <div className="max-w-md space-y-2">
              <MessageCircle className="mx-auto size-8 text-slate-400" />
              <p className="font-semibold text-slate-900">No matching conversation found</p>
              <p className="text-sm text-slate-600">
                No WACRM chat matches this record’s phone number. No other person’s chat was opened.
              </p>
            </div>
          </div>
        ) : result && contactsWithChats.length > 1 && !selectedContact ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
            <p className="text-sm text-slate-600">
              More than one WACRM contact matches this phone. Select the correct conversation.
            </p>
            {contactsWithChats.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelectedContactId(contact.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-4 text-left hover:bg-slate-50"
              >
                <span>
                  <span className="block font-medium text-slate-900">
                    {contact.name?.trim() || contact.phone}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">{contact.phone}</span>
                </span>
                <span className="text-sm font-medium text-emerald-800">Open chat</span>
              </button>
            ))}
          </div>
        ) : selectedContact && selectedConversation && result ? (
          <ConversationTranscript
            contact={selectedContact}
            conversationId={selectedConversation.id}
            messages={result.messages}
            historyMayBeLimited={result.historyMayBeLimitedConversationIds.includes(
              selectedConversation.id,
            )}
          />
        ) : (
          <div className="min-h-0 flex-1" />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WacrmConversationPanel({
  recordType,
  recordId,
}: {
  recordType: "lead" | "customer";
  recordId: string;
}) {
  const loadWacrmConversation = useServerFn(loadWacrmConversationFn);
  const loadConversation = useMutation({
    retry: false,
    mutationFn: async (): Promise<WacrmConversationResult> =>
      loadWacrmConversation({ data: { recordType, recordId } }),
  });
  const { mutate: load } = loadConversation;
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const result = loadConversation.data;
  const contactsWithChats =
    result?.candidates.filter((contact) => contact.conversations.length > 0) ?? [];
  const selectedContact =
    contactsWithChats.find((contact) => contact.id === selectedContactId) ??
    (contactsWithChats.length === 1 ? contactsWithChats[0] : null);
  const selectedConversation = selectedContact?.conversations[0];

  return (
    <section className="lg:col-span-3 flex h-[min(70vh,720px)] min-h-[420px] flex-col overflow-hidden rounded-lg border bg-white">
      <header className="shrink-0 border-b px-5 py-3">
        <h2 className="font-semibold text-slate-900">WhatsApp conversation</h2>
        <p className="text-sm text-slate-600">
          Conversation history is loaded from the signed-in WACRM account.
        </p>
      </header>
      {loadConversation.isPending ? (
        <div className="grid min-h-0 flex-1 place-items-center">
          <div className="flex items-center gap-3 text-sm text-slate-600" role="status">
            <LoaderCircle className="size-5 animate-spin text-emerald-700" />
            Loading matched chat…
          </div>
        </div>
      ) : loadConversation.isError ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div className="max-w-md space-y-3">
            <p className="font-semibold text-slate-900">Could not load the WACRM conversation</p>
            <p className="text-sm text-slate-600">
              {loadConversation.error instanceof Error
                ? loadConversation.error.message
                : "Check the WACRM session and allowed CRM origin, then try again."}
            </p>
            <Button type="button" onClick={() => load()}>
              Retry
            </Button>
          </div>
        </div>
      ) : result && contactsWithChats.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div className="max-w-md space-y-2">
            <MessageCircle className="mx-auto size-8 text-slate-400" />
            <p className="font-semibold text-slate-900">No matching conversation found</p>
            <p className="text-sm text-slate-600">
              No WACRM chat matches this record’s phone number. No other person’s chat was opened.
            </p>
          </div>
        </div>
      ) : result && contactsWithChats.length > 1 && !selectedContact ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <p className="text-sm text-slate-600">
            More than one WACRM contact matches this phone. Select the correct conversation.
          </p>
          {contactsWithChats.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => setSelectedContactId(contact.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-4 text-left hover:bg-slate-50"
            >
              <span>
                <span className="block font-medium text-slate-900">
                  {contact.name?.trim() || contact.phone}
                </span>
                <span className="mt-1 block text-sm text-slate-600">{contact.phone}</span>
              </span>
              <span className="text-sm font-medium text-emerald-800">Open chat</span>
            </button>
          ))}
        </div>
      ) : selectedContact && selectedConversation && result ? (
        <ConversationTranscript
          contact={selectedContact}
          conversationId={selectedConversation.id}
          messages={result.messages}
          historyMayBeLimited={result.historyMayBeLimitedConversationIds.includes(
            selectedConversation.id,
          )}
        />
      ) : (
        <div className="min-h-0 flex-1" />
      )}
    </section>
  );
}
