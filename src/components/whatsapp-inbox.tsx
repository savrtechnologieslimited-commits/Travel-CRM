import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CornerUpLeft,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  Mic,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  Send,
  SmilePlus,
  Video,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, titleize } from "@/lib/crm";
import { wacrmSupabase as supabase } from "@/integrations/supabase/wacrm-client";
import { useCustomers, useEnquiries, useLeads, useProfiles } from "@/lib/data";
import { useMessageTemplates } from "@/lib/data";
import {
  findBestConversationForContext,
  formatConversationMode,
  useAssignWhatsAppTag,
  useCreateWhatsAppContactNote,
  useCreateWhatsAppConversation,
  useCreateWhatsAppTag,
  useDeleteWhatsAppContactNote,
  useMarkConversationRead,
  useRemoveWhatsAppTag,
  useUpdateWhatsAppConversation,
  useWhatsAppContactNotes,
  useWhatsAppContactTags,
  useAllWhatsAppContactTags,
  useWhatsAppConversations,
  useWhatsAppConversationsForContext,
  useWhatsAppMessages,
  useWhatsAppQuickReplies,
  useWhatsAppTags,
  useWhatsAppTravelRequirements,
} from "@/lib/whatsapp-data";
import {
  buildConversationContextSummary,
  buildQuotedReplyLabel,
  formatWhatsAppMessageDay,
  getWhatsAppCustomerWindow,
  matchesContactTagIds,
} from "@/lib/whatsapp-inbox-adapter";
import { getWhatsAppSendModeFn, sendWhatsAppMessageFn } from "@/lib/whatsapp-send";
import type { WhatsAppOutboundPayload } from "@/lib/whatsapp-provider.server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { parseValidPhoneNumber } from "@/lib/phone-number";

const UNSET = "__unset__";
const REACTION_EMOJIS = ["👍", "🔥", "❤️", "😂", "😮"] as const;

export function WhatsAppInbox() {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const markRead = useMarkConversationRead();

  const { data: conversations = [], isLoading, isError, error } = useWhatsAppConversations(search);
  const { data: allTags = [] } = useWhatsAppTags();

  useEffect(() => {
    if (!activeId && conversations[0]) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return conversations;
    return conversations.filter((conversation) => conversation.status === statusFilter);
  }, [conversations, statusFilter]);

  const activeConversation = useMemo(
    () => filtered.find((conversation) => conversation.id === activeId) ?? null,
    [filtered, activeId],
  );

  const openConversation = (id: string, unreadCount?: number) => {
    setActiveId(id);
    setMobileThreadOpen(true);
    if ((unreadCount ?? 0) > 0) {
      markRead.mutate(id);
    }
  };

  return (
    <div className="grid h-[calc(100vh-12rem)] min-h-[500px] gap-3 xl:grid-cols-[350px_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <div>
            <p className="text-sm font-semibold">WhatsApp inbox</p>
            <p className="text-xs text-muted-foreground">Separate supplier connection</p>
          </div>
          <NewConversationDialog onCreated={(id) => openConversation(id, 0)} />
        </div>

        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 flex-1 min-w-[130px]">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            {allTags.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-9">
                    Tags
                    {selectedTagIds.length > 0 && (
                      <span className="ml-2 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                        {selectedTagIds.length}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {allTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag.id}
                      checked={selectedTagIds.includes(tag.id)}
                      onCheckedChange={(checked) =>
                        setSelectedTagIds((current) =>
                          checked ? [...current, tag.id] : current.filter((id) => id !== tag.id),
                        )
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: tag.color ?? "#3b82f6" }}
                        />
                        {tag.name}
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {selectedTagIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTagIds.map((tagId) => {
                const tag = allTags.find((item) => item.id === tagId);
                if (!tag) return null;
                return (
                  <button
                    key={tagId}
                    type="button"
                    onClick={() =>
                      setSelectedTagIds((current) => current.filter((id) => id !== tagId))
                    }
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                  >
                    {tag.name}
                    <X className="size-3" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading conversations…</p>}
          {isError && (
            <p role="alert" className="p-3 text-sm text-destructive">
              Could not load WhatsApp conversations.{" "}
              {error instanceof Error ? error.message : "Check the WACRM Supabase connection."}
            </p>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              No conversations match the current filter.
            </p>
          )}

          {filtered.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => openConversation(conversation.id, conversation.unread_count)}
              className={`flex w-full flex-col gap-1 border-b p-3 text-left transition hover:bg-muted/60 ${
                conversation.id === activeId ? "bg-muted" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {(
                    conversation.customers?.full_name ??
                    conversation.leads?.customer_name ??
                    conversation.phone_number
                  )
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <span className="truncate text-sm font-medium">
                  {conversation.customers?.full_name ??
                    conversation.leads?.customer_name ??
                    `+${conversation.phone_number}`}
                </span>
                {conversation.unread_count > 0 && (
                  <Badge className="ml-auto shrink-0">{conversation.unread_count}</Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                +{conversation.phone_number}
                {conversation.enquiries?.code ? ` · ${conversation.enquiries.code}` : ""}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {conversation.last_message_text || "No messages yet"}
              </span>
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">
                  {conversation.profiles?.full_name
                    ? `Assigned: ${conversation.profiles.full_name}`
                    : "Unassigned"}
                </span>
                <span
                  aria-label={`Conversation ${conversation.status}`}
                  title={titleize(conversation.status)}
                  className={`size-2 shrink-0 rounded-full ${
                    conversation.status === "open"
                      ? "bg-primary"
                      : conversation.status === "pending"
                        ? "bg-amber-500"
                        : "bg-muted-foreground"
                  }`}
                />
                <span className="shrink-0">
                  {formatConversationMode(conversation.conversation_mode)}
                </span>
                <span className="ml-auto shrink-0">
                  {conversation.last_message_at
                    ? formatDateTime(conversation.last_message_at)
                    : "—"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="hidden min-h-0 rounded-xl border bg-card xl:block">
        {activeConversation ? (
          <ConversationPanel
            conversation={activeConversation}
            onBack={() => setMobileThreadOpen(false)}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            Select a conversation to see its messages.
          </div>
        )}
      </div>
    </div>
  );
}

type Conversation =
  ReturnType<typeof useWhatsAppConversations> extends { data: Array<infer T> } ? T : never;

export function WhatsAppChatDialog({
  trigger,
  context,
  initialMessage,
}: {
  trigger?: React.ReactNode;
  initialMessage?: string;
  context: {
    leadId?: string | null;
    enquiryId?: string | null;
    customerId?: string | null;
    phoneNumber?: string | null;
    customerName?: string | null;
    destination?: string | null;
    status?: string | null;
    assignedEmployeeName?: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const markRead = useMarkConversationRead();
  const { data: conversations = [] } = useWhatsAppConversationsForContext(context);
  const active = useMemo(
    () => findBestConversationForContext(conversations, context),
    [conversations, context],
  );
  const contactType = context.customerId ? "customer" : context.enquiryId ? "enquiry" : "lead";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && active && active.id && active.unread_count && active.unread_count > 0) {
          markRead.mutate(active.id);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            WhatsApp Chat
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>WhatsApp chat</DialogTitle>
        </DialogHeader>
        {!active ? (
          <div className="space-y-3 py-4 text-sm text-muted-foreground">
            <p>No existing WhatsApp conversation was found for this {contactType}.</p>
            <p>The CRM will re-use the existing thread instead of creating a duplicate.</p>
          </div>
        ) : (
          <ConversationPanel
            conversation={active as Conversation}
            context={context}
            initialMessage={initialMessage}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConversationPanel({
  conversation,
  context,
  onBack,
  initialMessage,
}: {
  conversation: Conversation;
  onBack?: () => void;
  initialMessage?: string;
  context?: {
    customerName?: string | null;
    destination?: string | null;
    status?: string | null;
    assignedEmployeeName?: string | null;
  };
}) {
  const { data: messages = [], isLoading } = useWhatsAppMessages(conversation.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: profiles = [] } = useProfiles();
  const { data: templates = [] } = useMessageTemplates();
  const { data: leads = [] } = useLeads();
  const { data: enquiries = [] } = useEnquiries();
  const { data: requirement } = useWhatsAppTravelRequirements(conversation.id);
  const { data: quickReplies = [] } = useWhatsAppQuickReplies();
  const { data: allTags = [] } = useWhatsAppTags();
  const { data: contactTags = [] } = useWhatsAppContactTags({
    customerId: conversation.customer_id,
    leadId: conversation.lead_id,
    enquiryId: conversation.enquiry_id,
  });
  const { data: contactNotes = [] } = useWhatsAppContactNotes({
    conversationId: conversation.id,
    customerId: conversation.customer_id,
    leadId: conversation.lead_id,
    enquiryId: conversation.enquiry_id,
  });
  const createTag = useCreateWhatsAppTag();
  const assignTag = useAssignWhatsAppTag();
  const removeTag = useRemoveWhatsAppTag();
  const createNote = useCreateWhatsAppContactNote();
  const deleteNote = useDeleteWhatsAppContactNote();
  const update = useUpdateWhatsAppConversation();

  const contextSummary = useMemo(
    () => buildConversationContextSummary(conversation),
    [conversation],
  );

  const [draft, setDraft] = useState(initialMessage ?? "");
  const [replyMessageId, setReplyMessageId] = useState<string | null>(null);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [touchMessageActions, setTouchMessageActions] = useState<string | null>(null);
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<
    "text" | "image" | "video" | "audio" | "document" | "buttons" | "list"
  >("text");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaStoragePath, setMediaStoragePath] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [documentFilename, setDocumentFilename] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [buttonTitles, setButtonTitles] = useState("Domestic, International, Speak to Agent");
  const [listSectionTitle, setListSectionTitle] = useState("Destinations");
  const [listButtonText, setListButtonText] = useState("View options");
  const [listRows, setListRows] = useState("Goa\nDubai");
  const [windowClock, setWindowClock] = useState(Date.now());
  const queryClient = useQueryClient();
  const sendMode = useQuery({
    queryKey: ["whatsapp-send-mode"],
    queryFn: () => getWhatsAppSendModeFn(),
  });
  const sendMessage = useMutation({
    mutationFn: (input: { payload: WhatsAppOutboundPayload; replyToMessageId: string | null }) =>
      sendWhatsAppMessageFn({
        data: {
          conversationId: conversation.id,
          payload: input.payload,
          replyToMessageId: input.replyToMessageId,
        },
      }),
    onSuccess: (result) => {
      setDraft("");
      setMediaUrl("");
      setMediaStoragePath("");
      setMediaCaption("");
      setDocumentFilename("");
      toast.success(
        result.mode === "meta"
          ? "Meta accepted the message for sending"
          : "Local mock message queued",
      );
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setWindowClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const latestInboundMessage = [...messages]
    .reverse()
    .find((message) => message.direction === "inbound");
  const replyTarget = useMemo(
    () => messages.find((message) => message.id === replyMessageId) ?? null,
    [messages, replyMessageId],
  );
  const mediaMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          (message.message_type === "image" || message.message_type === "video") &&
          message.media_url,
      ),
    [messages],
  );
  const activeMediaIndex = mediaMessages.findIndex((message) => message.id === activeMediaId);
  const activeMedia = activeMediaIndex >= 0 ? mediaMessages[activeMediaIndex] : null;
  const customerWindow = getWhatsAppCustomerWindow(
    latestInboundMessage?.message_timestamp ?? null,
    windowClock,
  );
  const freeFormBlocked = sendMode.data?.mode === "meta" && !customerWindow.isOpen;
  const remainingMinutes = Math.ceil(customerWindow.remainingMs / 60_000);
  const [newTagName, setNewTagName] = useState("");
  const [newNoteText, setNewNoteText] = useState("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (initialMessage) setDraft(initialMessage);
  }, [initialMessage]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const { data: reactions = [] } = useQuery({
    queryKey: ["whatsapp-message-reactions", conversation.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("whatsapp_message_reactions" as never) as any)
        .select("id,message_id,emoji,actor_profile_id,created_at")
        .in(
          "message_id",
          messages.map((message) => message.id),
        );
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        message_id: string;
        emoji: string;
        actor_profile_id: string | null;
      }>;
    },
    enabled: messages.length > 0,
  });
  useEffect(() => {
    if (messages.length > 0) {
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-message-reactions", conversation.id],
      });
    }
  }, [conversation.id, messages, queryClient]);
  const toggleReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!currentUserId) throw new Error("Sign in again to react to messages.");
      const existing = reactions.find(
        (reaction) =>
          reaction.message_id === messageId &&
          reaction.emoji === emoji &&
          reaction.actor_profile_id === currentUserId,
      );
      const table = supabase.from("whatsapp_message_reactions" as never) as any;
      const result = existing
        ? await table.delete().eq("id", existing.id)
        : await table.insert({ message_id: messageId, emoji, actor_profile_id: currentUserId });
      if (result.error) throw result.error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["whatsapp-message-reactions", conversation.id] }),
    onError: (error: Error) => toast.error(error.message),
  });

  async function uploadAttachment(file: File | undefined) {
    if (!file) return;
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "document";
    if (file.size > 16 * 1024 * 1024) {
      toast.error("WhatsApp attachments must be 16 MB or smaller.");
      return;
    }
    setUploadingAttachment(true);
    const path = `${conversation.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from("whatsapp-media")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      setMessageKind(kind);
      setMediaUrl("");
      setMediaStoragePath(path);
      setDocumentFilename(file.name);
      setMediaCaption("");
      toast.success("Attachment ready to send");
    } catch (error) {
      await supabase.storage.from("whatsapp-media").remove([path]);
      toast.error(error instanceof Error ? error.message : "Attachment upload failed.");
    } finally {
      setUploadingAttachment(false);
    }
  }

  function sendOutbound() {
    const requiresText =
      messageKind === "text" || messageKind === "buttons" || messageKind === "list";
    if (requiresText && !draft.trim()) {
      toast.error("Write a message first");
      return;
    }
    if (
      (messageKind === "image" ||
        messageKind === "video" ||
        messageKind === "audio" ||
        messageKind === "document") &&
      !mediaUrl.trim() &&
      !mediaStoragePath
    ) {
      toast.error("Attach a file or enter a media URL first");
      return;
    }
    let payload: WhatsAppOutboundPayload;
    if (messageKind === "text") {
      payload = { type: "text", text: draft.trim() };
    } else if (messageKind === "image") {
      payload = {
        type: "image",
        url: mediaUrl.trim(),
        ...(mediaStoragePath ? { storagePath: mediaStoragePath } : {}),
        ...(mediaCaption.trim() ? { caption: mediaCaption.trim() } : {}),
      };
    } else if (messageKind === "video") {
      payload = {
        type: "video",
        url: mediaUrl.trim(),
        ...(mediaStoragePath ? { storagePath: mediaStoragePath } : {}),
        ...(mediaCaption.trim() ? { caption: mediaCaption.trim() } : {}),
      };
    } else if (messageKind === "audio") {
      payload = {
        type: "audio",
        url: mediaUrl.trim(),
        ...(mediaStoragePath ? { storagePath: mediaStoragePath } : {}),
      };
    } else if (messageKind === "document") {
      payload = {
        type: "document",
        url: mediaUrl.trim(),
        ...(mediaStoragePath ? { storagePath: mediaStoragePath } : {}),
        ...(mediaCaption.trim() ? { caption: mediaCaption.trim() } : {}),
        ...(documentFilename.trim() ? { filename: documentFilename.trim() } : {}),
      };
    } else if (messageKind === "buttons") {
      const buttons = buttonTitles
        .split(",")
        .map((title) => title.trim())
        .filter(Boolean)
        .map((title) => ({
          id: title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, ""),
          title,
        }));
      payload = { type: "buttons", text: draft.trim(), buttons };
    } else {
      const rows = listRows
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean)
        .map((title) => ({
          id: title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, ""),
          title,
        }));
      payload = {
        type: "list",
        text: draft.trim(),
        buttonText: listButtonText.trim(),
        sections: [{ title: listSectionTitle.trim(), rows }],
      };
    }
    sendMessage.mutate({ payload, replyToMessageId: replyMessageId });
    setReplyMessageId(null);
  }

  return (
    <div
      className={`grid h-full min-h-0 gap-0 overflow-hidden ${contactPanelOpen ? "xl:grid-cols-[minmax(0,1fr)_280px]" : "grid-cols-1"}`}
    >
      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            void uploadAttachment(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/3gpp"
          className="hidden"
          onChange={(event) => {
            void uploadAttachment(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={documentInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          className="hidden"
          onChange={(event) => {
            void uploadAttachment(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/aac,audio/amr,audio/mpeg,audio/mp4,audio/ogg,audio/opus"
          className="hidden"
          onChange={(event) => {
            void uploadAttachment(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <div className="flex min-w-0 items-center gap-2">
            {onBack && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0 lg:hidden"
                aria-label="Back to conversations"
                onClick={onBack}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {conversation.customers?.full_name ??
                  conversation.leads?.customer_name ??
                  `+${conversation.phone_number}`}
              </p>
              <p className="text-xs text-muted-foreground">
                +{conversation.phone_number} · {titleize(conversation.status)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Refresh conversation"
              title="Refresh conversation"
              onClick={() => {
                void queryClient.invalidateQueries({
                  queryKey: ["whatsapp-messages", conversation.id],
                });
                void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="hidden xl:inline-flex"
              aria-label={contactPanelOpen ? "Hide contact details" : "Show contact details"}
              title={contactPanelOpen ? "Hide contact details" : "Show contact details"}
              aria-pressed={contactPanelOpen}
              onClick={() => setContactPanelOpen((open) => !open)}
            >
              {contactPanelOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>
            <Select
              value={conversation.status}
              onValueChange={(status) => update.mutate({ id: conversation.id, values: { status } })}
            >
              <SelectTrigger className="h-8 w-[112px]" aria-label="Conversation status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={conversation.assigned_employee_id ?? UNSET}
              onValueChange={(value) =>
                update.mutate({
                  id: conversation.id,
                  values: { assigned_employee_id: value === UNSET ? null : value },
                })
              }
            >
              <SelectTrigger className="h-8 w-[132px]" aria-label="Assign conversation">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Unassigned</SelectItem>
                {conversation.assigned_employee_id &&
                !profiles.some((profile) => profile.id === conversation.assigned_employee_id) ? (
                  <SelectItem value={conversation.assigned_employee_id} disabled>
                    Existing assignee
                  </SelectItem>
                ) : null}
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading messages…</p>}
          {!isLoading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages on this conversation yet.</p>
          )}
          {messages.map((m, index) => {
            const day = formatWhatsAppMessageDay(m.message_timestamp);
            const previousDay =
              index > 0 ? formatWhatsAppMessageDay(messages[index - 1]!.message_timestamp) : null;
            const messageReactions = reactions.filter((reaction) => reaction.message_id === m.id);
            return (
              <div key={m.id}>
                {day !== previousDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-background/80 px-3 py-1 text-[10px] font-medium text-muted-foreground shadow-sm">
                      {day}
                    </span>
                  </div>
                )}
                <div
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setTouchMessageActions(m.id);
                  }}
                  onClick={() => setTouchMessageActions(null)}
                  className={`group/message relative max-w-[80%] rounded-lg p-3 text-sm ${
                    m.direction === "inbound"
                      ? "mr-auto rounded-tl-none bg-muted"
                      : "ml-auto rounded-tr-none bg-primary/10"
                  }`}
                >
                  {m.reply_to_message_id && (
                    <div className="mb-2 rounded border border-dashed bg-background/50 p-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">Replying to:</span>{" "}
                      {messages.find((origin) => origin.id === m.reply_to_message_id)?.body ??
                        "Earlier message"}
                    </div>
                  )}
                  {m.message_type === "image" && m.media_url ? (
                    <button
                      type="button"
                      onClick={() => setActiveMediaId(m.id)}
                      aria-label="Open image viewer"
                    >
                      <img
                        src={m.media_url}
                        alt={m.body || "WhatsApp image"}
                        loading="lazy"
                        className="mb-2 max-h-64 max-w-full rounded object-contain"
                      />
                    </button>
                  ) : null}
                  {m.message_type === "video" && m.media_url && (
                    <button
                      type="button"
                      onClick={() => setActiveMediaId(m.id)}
                      aria-label="Open video viewer"
                      className="mb-2 block max-w-full"
                    >
                      <video
                        src={m.media_url}
                        muted
                        preload="metadata"
                        className="max-h-64 max-w-full rounded"
                      />
                    </button>
                  )}
                  <p className="whitespace-pre-wrap break-words">
                    {m.body ?? (m.media_url ? "" : titleize(m.message_type))}
                  </p>
                  {m.media_url && m.message_type !== "image" && m.message_type !== "video" && (
                    <a
                      className="mt-2 block text-xs text-primary underline"
                      href={m.media_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open document
                    </a>
                  )}
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {m.direction === "inbound" ? (
                      <ArrowDownLeft className="size-3" />
                    ) : (
                      <ArrowUpRight className="size-3" />
                    )}
                    {formatDateTime(m.message_timestamp)} · {titleize(m.delivery_status)}
                  </p>
                  <div
                    className={`absolute -top-3 z-10 flex items-center gap-0.5 rounded-full border bg-popover/95 px-1 shadow-sm backdrop-blur-sm transition-opacity md:opacity-0 md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100 ${m.direction === "inbound" ? "left-2" : "right-2"} ${touchMessageActions === m.id ? "opacity-100" : "opacity-100 md:opacity-0"}`}
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label="Reply to message"
                      title="Reply"
                      onClick={() => setReplyMessageId(m.id)}
                    >
                      <CornerUpLeft className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label="Copy message"
                      title="Copy message"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(m.body ?? "")
                          .then(() => toast.success("Message copied"))
                          .catch(() => toast.error("Could not copy message"));
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          aria-label="React to message"
                          title="React"
                        >
                          <SmilePlus className="size-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="flex w-auto gap-1 p-1.5" sideOffset={6}>
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            aria-label={`React with ${emoji}`}
                            onClick={() => toggleReaction.mutate({ messageId: m.id, emoji })}
                            className="flex size-8 items-center justify-center rounded-full text-lg hover:bg-muted"
                          >
                            {emoji}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                  {messageReactions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {REACTION_EMOJIS.map((emoji) => {
                        const count = messageReactions.filter(
                          (reaction) => reaction.emoji === emoji,
                        ).length;
                        return count > 0 ? (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleReaction.mutate({ messageId: m.id, emoji })}
                            className="rounded-full border bg-background/70 px-1.5 py-0.5 text-xs"
                            aria-label={`Remove or add ${emoji} reaction`}
                          >
                            {emoji} {count}
                          </button>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        {activeMedia && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setActiveMediaId(null);
            }}
          >
            <DialogContent className="w-auto max-w-[95vw] sm:max-w-5xl">
              <DialogHeader>
                <DialogTitle>
                  Media {activeMediaIndex + 1} of {mediaMessages.length}
                </DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Previous media"
                  disabled={activeMediaIndex <= 0}
                  onClick={() => setActiveMediaId(mediaMessages[activeMediaIndex - 1]?.id ?? null)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {activeMedia.message_type === "video" ? (
                  <video
                    src={activeMedia.media_url ?? undefined}
                    controls
                    autoPlay
                    className="max-h-[70vh] max-w-full rounded"
                  />
                ) : (
                  <img
                    src={activeMedia.media_url ?? undefined}
                    alt={activeMedia.body || "WhatsApp image"}
                    className="max-h-[70vh] max-w-full object-contain"
                  />
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Next media"
                  disabled={activeMediaIndex >= mediaMessages.length - 1}
                  onClick={() => setActiveMediaId(mediaMessages[activeMediaIndex + 1]?.id ?? null)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              {activeMedia.body && (
                <p className="whitespace-pre-wrap text-sm">{activeMedia.body}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" asChild>
                  <a href={activeMedia.media_url ?? undefined} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 size-4" />
                    Open original
                  </a>
                </Button>
                <Button type="button" size="sm" variant="outline" asChild>
                  <a href={activeMedia.media_url ?? undefined} download>
                    <Download className="mr-2 size-4" />
                    Download
                  </a>
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        <div className="space-y-2 border-t p-3">
          {templates.length > 0 && (
            <Select
              value=""
              onValueChange={(templateId) => {
                const template = templates.find((item) => item.id === templateId);
                if (template)
                  setDraft((current) => (current ? `${current}\n${template.body}` : template.body));
              }}
              disabled={freeFormBlocked}
            >
              <SelectTrigger aria-label="Insert saved CRM template">
                <SelectValue placeholder="Insert saved CRM template" />
              </SelectTrigger>
              <SelectContent>
                {templates
                  .filter((template) => template.channel === "whatsapp" || !template.channel)
                  .map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={freeFormBlocked}
            onClick={() => setQuickRepliesOpen(true)}
          >
            <Zap className="mr-2 size-4" /> Quick replies
          </Button>
          <Dialog open={quickRepliesOpen} onOpenChange={setQuickRepliesOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Quick replies</DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {quickReplies.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No saved quick replies.
                  </p>
                ) : (
                  quickReplies.map((reply) => (
                    <button
                      key={reply.id}
                      type="button"
                      onClick={() => {
                        setDraft((current) => (current ? `${current}\n${reply.body}` : reply.body));
                        setQuickRepliesOpen(false);
                      }}
                      className="flex w-full flex-col items-start rounded-md border p-3 text-left hover:bg-muted"
                    >
                      <span className="text-sm font-medium">{reply.title}</span>
                      <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {reply.body}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
          {replyTarget && (
            <div className="rounded-md border border-dashed bg-muted/40 p-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Replying to:</p>
              <p className="mt-1 whitespace-pre-wrap">{buildQuotedReplyLabel(replyTarget)}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-7 px-2"
                onClick={() => setReplyMessageId(null)}
              >
                Clear reply
              </Button>
            </div>
          )}
          {sendMode.data?.mode === "meta" && (
            <p
              className={`rounded-md px-3 py-2 text-xs ${freeFormBlocked ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}
            >
              {freeFormBlocked
                ? "The 24-hour WhatsApp reply window is closed. This CRM does not send Meta-approved templates yet."
                : `WhatsApp reply window: ${Math.floor(remainingMinutes / 60)}h ${remainingMinutes % 60}m remaining.`}
            </p>
          )}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Attach media"
                  title="Attach media"
                  disabled={uploadingAttachment || freeFormBlocked}
                >
                  {uploadingAttachment ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Paperclip className="size-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => imageInputRef.current?.click()}>
                  <ImageIcon className="mr-2 size-4" />
                  Photo
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => videoInputRef.current?.click()}>
                  <Video className="mr-2 size-4" />
                  Video
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => documentInputRef.current?.click()}>
                  <FileText className="mr-2 size-4" />
                  Document
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => audioInputRef.current?.click()}>
                  <Mic className="mr-2 size-4" />
                  Audio file
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {(mediaUrl || mediaStoragePath) && (
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {documentFilename || messageKind}
              </span>
            )}
            {(mediaUrl || mediaStoragePath) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={async () => {
                  if (mediaStoragePath)
                    await supabase.storage.from("whatsapp-media").remove([mediaStoragePath]);
                  setMediaUrl("");
                  setMediaStoragePath("");
                  setMediaCaption("");
                  setDocumentFilename("");
                }}
              >
                Remove attachment
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs" htmlFor="whatsapp-message-kind">
              Message type
            </Label>
            <Badge variant={sendMode.data?.mode === "meta" ? "default" : "secondary"}>
              {sendMode.isLoading
                ? "Checking mode…"
                : sendMode.isError
                  ? "Mode unavailable"
                  : sendMode.data?.mode === "meta"
                    ? "META"
                    : "LOCAL MOCK"}
            </Badge>
          </div>
          <Select
            value={messageKind}
            onValueChange={(value) => setMessageKind(value as typeof messageKind)}
            disabled={freeFormBlocked}
          >
            <SelectTrigger id="whatsapp-message-kind" aria-label="WhatsApp message type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="image">Image URL</SelectItem>
              <SelectItem value="video">Video URL</SelectItem>
              <SelectItem value="audio">Audio URL</SelectItem>
              <SelectItem value="document">PDF / document URL</SelectItem>
              <SelectItem value="buttons">Interactive buttons</SelectItem>
              <SelectItem value="list">Interactive list</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            rows={2}
            placeholder={messageKind === "text" ? "Type a WhatsApp reply" : "Message body"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={freeFormBlocked}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!sendMessage.isPending) sendOutbound();
              }
            }}
          />
          {(messageKind === "image" ||
            messageKind === "video" ||
            messageKind === "document" ||
            messageKind === "audio") && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="Public media URL"
                placeholder="Public HTTPS media URL"
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                disabled={freeFormBlocked}
              />
              <Input
                aria-label="Media caption"
                placeholder="Caption (optional)"
                value={mediaCaption}
                onChange={(event) => setMediaCaption(event.target.value)}
                disabled={freeFormBlocked}
              />
              {messageKind === "document" && (
                <Input
                  aria-label="Document filename"
                  placeholder="Filename (optional)"
                  value={documentFilename}
                  onChange={(event) => setDocumentFilename(event.target.value)}
                  disabled={freeFormBlocked}
                />
              )}
            </div>
          )}
          {messageKind === "buttons" && (
            <Input
              aria-label="Button titles"
              placeholder="Button titles, separated by commas"
              value={buttonTitles}
              onChange={(event) => setButtonTitles(event.target.value)}
              disabled={freeFormBlocked}
            />
          )}
          {messageKind === "list" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="List section title"
                placeholder="Section title"
                value={listSectionTitle}
                onChange={(event) => setListSectionTitle(event.target.value)}
                disabled={freeFormBlocked}
              />
              <Input
                aria-label="List button label"
                placeholder="Open-list button label"
                value={listButtonText}
                onChange={(event) => setListButtonText(event.target.value)}
                disabled={freeFormBlocked}
              />
              <Textarea
                className="sm:col-span-2"
                rows={3}
                aria-label="List options"
                placeholder="One option per line"
                value={listRows}
                onChange={(event) => setListRows(event.target.value)}
                disabled={freeFormBlocked}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={sendOutbound}
              disabled={
                sendMessage.isPending ||
                uploadingAttachment ||
                sendMode.isLoading ||
                sendMode.isError ||
                freeFormBlocked
              }
            >
              <Send className="mr-2 size-4" />{" "}
              {sendMessage.isPending
                ? "Sending…"
                : sendMode.data?.mode === "meta"
                  ? "Send via Meta"
                  : "Queue locally"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {sendMode.data?.mode === "meta"
              ? "Meta mode sends through the server-side WhatsApp Cloud API. Status reflects API acceptance only."
              : "Local mock mode stores a queued simulation and does not contact Meta or WhatsApp."}
          </p>
        </div>
      </section>

      {contactPanelOpen && (
        <aside className="hidden h-full min-h-0 flex-col gap-4 overflow-y-auto border-l p-4 xl:flex">
          <div className="flex flex-col items-center border-b pb-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {(
                conversation.customers?.full_name ??
                conversation.leads?.customer_name ??
                conversation.phone_number
              )
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <p className="mt-2 text-sm font-semibold">
              {conversation.customers?.full_name ??
                conversation.leads?.customer_name ??
                `+${conversation.phone_number}`}
            </p>
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                void navigator.clipboard
                  .writeText(`+${conversation.phone_number}`)
                  .then(() => toast.success("Phone number copied"))
                  .catch(() => toast.error("Could not copy phone number"));
              }}
            >
              +{conversation.phone_number}
              <Copy className="size-3" />
            </button>
            {conversation.customers?.email && (
              <p className="mt-1 max-w-full truncate text-xs text-muted-foreground">
                {conversation.customers.email}
              </p>
            )}
          </div>
          <section className="space-y-2 border-b pb-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Conversation control
            </p>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  conversation.conversation_mode === "HUMAN_ACTIVE" ? "destructive" : "secondary"
                }
              >
                {formatConversationMode(conversation.conversation_mode)}
              </Badge>
              {conversation.conversation_mode !== "HUMAN_ACTIVE" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update.mutate(
                      { id: conversation.id, values: { conversation_mode: "HUMAN_ACTIVE" } },
                      { onSuccess: () => toast.success("Conversation handed over to human team") },
                    )
                  }
                >
                  Take Over
                </Button>
              )}
            </div>
          </section>
          <section className="space-y-3 border-b pb-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Travel opportunities
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Linked lead</Label>
              <Select
                value={conversation.lead_id ?? UNSET}
                onValueChange={(v) =>
                  update.mutate(
                    { id: conversation.id, values: { lead_id: v === UNSET ? null : v } },
                    { onSuccess: () => toast.success("Lead link updated") },
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No lead linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>No lead linked</SelectItem>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code ? `${l.code} · ` : ""}
                      {l.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Linked enquiry</Label>
              <Select
                value={conversation.enquiry_id ?? UNSET}
                onValueChange={(v) =>
                  update.mutate(
                    { id: conversation.id, values: { enquiry_id: v === UNSET ? null : v } },
                    { onSuccess: () => toast.success("Enquiry link updated") },
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No enquiry linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>No enquiry linked</SelectItem>
                  {enquiries.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.code ?? e.id.slice(0, 8)}
                      {e.customers?.full_name ? ` · ${e.customers.full_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>
          <div className="space-y-2">
            <p className="text-sm font-medium">Tags</p>
            <div className="flex flex-wrap gap-2">
              {allTags.length > 0 && contactTags.length > 0 ? (
                contactTags.map((row) => {
                  const tag = allTags.find((item) => item.id === row.tag_id);
                  if (!tag) return null;
                  return (
                    <span
                      key={row.id}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                      style={{
                        backgroundColor: `${tag.color ?? "#3b82f6"}20`,
                        borderColor: `${tag.color ?? "#3b82f6"}80`,
                      }}
                    >
                      {tag.name}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          removeTag.mutate({
                            tagId: tag.id,
                            contact: {
                              customerId: conversation.customer_id,
                              leadId: conversation.lead_id,
                              enquiryId: conversation.enquiry_id,
                            },
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground">No tags yet.</p>
              )}
            </div>
            <div className="space-y-2">
              <Input
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="New tag name"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const value = newTagName.trim();
                    if (!value) return;
                    const created = await createTag
                      .mutateAsync({ name: value, color: "#3b82f6" })
                      .catch(() => null);
                    if (created) {
                      await assignTag.mutateAsync({
                        customer_id: conversation.customer_id,
                        lead_id: conversation.lead_id,
                        enquiry_id: conversation.enquiry_id,
                        tag_id: created.id,
                      });
                      setNewTagName("");
                    }
                  }}
                >
                  Add tag
                </Button>
                <Select
                  value=""
                  onValueChange={(tagId) =>
                    assignTag.mutate({
                      customer_id: conversation.customer_id,
                      lead_id: conversation.lead_id,
                      enquiry_id: conversation.enquiry_id,
                      tag_id: tagId,
                    })
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Assign existing tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {allTags
                      .filter((tag) => !contactTags.some((row) => row.tag_id === tag.id))
                      .map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          {tag.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <section className="space-y-3 border-b pb-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Internal notes</p>
            <div className="space-y-2">
              {contactNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No internal notes yet.</p>
              ) : (
                contactNotes.map((note) => (
                  <div key={note.id} className="rounded-md border bg-muted/30 p-2 text-xs">
                    <p className="whitespace-pre-wrap">{note.note}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span>{new Date(note.created_at ?? Date.now()).toLocaleString()}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => deleteNote.mutate(note.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Textarea
              value={newNoteText}
              onChange={(event) => setNewNoteText(event.target.value)}
              placeholder="Add an internal note; it never goes to WhatsApp"
              rows={3}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (!newNoteText.trim()) return;
                createNote.mutate({
                  conversation_id: conversation.id,
                  customer_id: conversation.customer_id,
                  lead_id: conversation.lead_id,
                  enquiry_id: conversation.enquiry_id,
                  note: newNoteText,
                });
                setNewNoteText("");
              }}
            >
              Save note
            </Button>
          </section>
          {requirement && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
              <p className="font-medium">Travel requirements</p>
              <dl className="grid gap-2 text-xs text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <dt>Destination</dt>
                  <dd>{requirement.destination_text ?? "Unknown"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Dates</dt>
                  <dd>
                    {requirement.travel_start_date ?? "Unknown"} →{" "}
                    {requirement.travel_end_date ?? "Unknown"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Pax</dt>
                  <dd>
                    {requirement.adults ?? "?"} adults · {requirement.children ?? "?"} children
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Departure</dt>
                  <dd>{requirement.departure_city ?? "Unknown"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Budget</dt>
                  <dd>{requirement.approximate_budget ?? "Unknown"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Hotel</dt>
                  <dd>{requirement.hotel_preference ?? "Unknown"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Trip</dt>
                  <dd>{requirement.trip_type ?? "Unknown"}</dd>
                </div>
              </dl>
              {requirement.special_requirements && (
                <p className="text-xs text-muted-foreground">
                  Special requirements: {requirement.special_requirements}
                </p>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function NewConversationDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState(UNSET);
  const [phone, setPhone] = useState("");
  const { data: customers = [] } = useCustomers();
  const create = useCreateWhatsAppConversation();

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c?.mobile) setPhone(c.mobile);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <MessageSquarePlus className="mr-2 size-4" /> New conversation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New WhatsApp conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Customer (optional)</Label>
            <Select value={customerId} onValueChange={pickCustomer}>
              <SelectTrigger>
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>No customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-conversation-phone">WhatsApp number</Label>
            <PhoneNumberInput
              id="new-conversation-phone"
              value={phone}
              onChange={setPhone}
              required
            />
          </div>
          <Button
            className="w-full"
            disabled={create.isPending}
            onClick={() => {
              const normalizedPhone = parseValidPhoneNumber(phone);
              if (!normalizedPhone) {
                toast.error("Enter a valid WhatsApp number for the selected country.");
                return;
              }
              create.mutate(
                {
                  phone_number: normalizedPhone,
                  customer_id: customerId === UNSET ? null : customerId,
                },
                {
                  onSuccess: (id) => {
                    onCreated(id);
                    setOpen(false);
                    setPhone("");
                    setCustomerId(UNSET);
                  },
                },
              );
            }}
          >
            Open conversation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
