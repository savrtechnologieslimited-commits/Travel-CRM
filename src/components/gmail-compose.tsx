import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronDown,
  Cloud,
  ImagePlus,
  Link2,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Minus,
  MoreVertical,
  Paperclip,
  PenLine,
  Send,
  Smile,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  EmailRichTextEditor,
  type EmailRichTextEditorHandle,
} from "@/components/email-rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendSupplierInquiryEmail } from "@/lib/gmail-provider";
import {
  MAX_EMAIL_ATTACHMENT_BYTES,
  MAX_EMAIL_ATTACHMENTS,
  escapeEmailHtml,
  htmlToPlainText,
  sanitizeEmailHtml,
  type EmailAttachment,
} from "@/lib/email-content";

type GmailComposeProps = {
  disabled?: boolean;
  onSent: () => void;
};

export function GmailCompose({ disabled = false, onSent }: GmailComposeProps) {
  const sendEmail = useServerFn(sendSupplierInquiryEmail);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EmailRichTextEditorHandle>(null);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [showFormatting, setShowFormatting] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSendMenu, setShowSendMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSignatureMenu, setShowSignatureMenu] = useState(false);
  const [plainTextOnly, setPlainTextOnly] = useState(false);
  const [signature, setSignature] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [readingAttachments, setReadingAttachments] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setSignature(window.localStorage.getItem("gmail-compose-signature") ?? "");
    } catch {
      setError("Browser storage is unavailable; saved signatures cannot be loaded.");
    }
  }, []);

  const hasDraft = Boolean(
    to.trim() ||
    cc.trim() ||
    bcc.trim() ||
    subject.trim() ||
    htmlToPlainText(body).trim() ||
    attachments.length,
  );

  function discardDraft() {
    if (hasDraft && !window.confirm("Discard this message?")) return;
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setBody("");
    setAttachments([]);
    setError("");
    setOpen(false);
    setMinimized(false);
    setMaximized(false);
  }

  function closeCompose() {
    setOpen(false);
    setMinimized(false);
    setMaximized(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!to.trim()) {
      setError("Enter at least one recipient.");
      return;
    }
    if (!subject.trim() && !htmlToPlainText(body).trim()) {
      if (!window.confirm("Send this message without a subject or body?")) return;
    }
    setSending(true);
    setError("");
    try {
      await sendEmail({
        data: {
          provider: "gmail",
          to,
          cc,
          bcc,
          subject,
          body,
          plainTextOnly,
          attachments,
        },
      });
      toast.success("Message sent");
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setAttachments([]);
      closeCompose();
      onSent();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  function insertLink() {
    const url = window.prompt("Enter a web or email link");
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
        setError("Use an https, http, or email link.");
        return;
      }
      setError("");
      editorRef.current?.insertLink(parsed.toString());
    } catch {
      setError("Enter a valid link.");
    }
  }

  function insertSignature() {
    if (!signature.trim()) {
      setError("Create a signature from the signature menu first.");
      setShowSignatureMenu(true);
      return;
    }
    editorRef.current?.insertText(`\n\n${signature}`);
    setShowSignatureMenu(false);
  }

  function editSignature() {
    const nextSignature = window.prompt("Edit your Gmail compose signature", signature);
    if (nextSignature === null) return;
    try {
      window.localStorage.setItem("gmail-compose-signature", nextSignature);
      setSignature(nextSignature);
      setError("");
      setShowSignatureMenu(false);
    } catch {
      setError("Could not save your signature in this browser.");
    }
  }

  function printDraft() {
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Allow pop-ups to print this draft.");
      return;
    }
    popup.opener = null;
    const printableBody = sanitizeEmailHtml(body);
    popup.document.open();
    popup.document.write(
      `<!doctype html><html><head><title>${escapeEmailHtml(subject || "Email draft")}</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;margin:32px;color:#202124}h1{font-size:18px}hr{border:0;border-top:1px solid #dadce0;margin:16px 0}.body{line-height:1.5;overflow-wrap:anywhere}</style></head><body><h1>${escapeEmailHtml(subject || "Email draft")}</h1><p><strong>To:</strong> ${escapeEmailHtml(to)}</p>${cc ? `<p><strong>Cc:</strong> ${escapeEmailHtml(cc)}</p>` : ""}${bcc ? `<p><strong>Bcc:</strong> ${escapeEmailHtml(bcc)}</p>` : ""}<hr><div class="body">${printableBody}</div></body></html>`,
    );
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }

  async function addAttachments(files: File[]) {
    if (attachments.length + files.length > MAX_EMAIL_ATTACHMENTS) {
      setError(`Attach no more than ${MAX_EMAIL_ATTACHMENTS} files.`);
      return;
    }
    const currentBytes = attachments.reduce(
      (total, attachment) => total + Math.floor((attachment.data.length * 3) / 4),
      0,
    );
    if (
      currentBytes + files.reduce((total, file) => total + file.size, 0) >
      MAX_EMAIL_ATTACHMENT_BYTES
    ) {
      setError("Email attachments and inline images must total 2.5 MB or less.");
      return;
    }
    setError("");
    setReadingAttachments(true);
    try {
      const newAttachments = await Promise.all(files.map(fileToEmailAttachment));
      setAttachments((current) => [...current, ...newAttachments]);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Could not read an attachment.");
    } finally {
      setReadingAttachments(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
        disabled={disabled}
      >
        <Send className="mr-2 size-4" />
        Compose
      </Button>
      {open && (
        <section
          aria-label="Compose email"
          className={`fixed z-50 flex flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl ${
            maximized
              ? "inset-2 rounded-lg"
              : minimized
                ? "bottom-0 right-4 h-12 w-[min(360px,calc(100vw-2rem))] rounded-t-lg"
                : "bottom-0 right-4 h-[min(620px,calc(100dvh-2rem))] w-[min(600px,calc(100vw-2rem))] rounded-t-lg"
          }`}
        >
          <header
            className="flex h-12 shrink-0 items-center justify-between bg-slate-100 px-4 text-sm font-medium text-slate-800"
            onDoubleClick={() => setMinimized((current) => !current)}
          >
            <span>New Message</span>
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={minimized ? "Restore compose" : "Minimize compose"}
                title={minimized ? "Restore" : "Minimize"}
                onClick={() => setMinimized((current) => !current)}
              >
                <Minus className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={maximized ? "Restore compose" : "Expand compose"}
                title={maximized ? "Restore" : "Full screen"}
                onClick={() => {
                  setMaximized((current) => !current);
                  setMinimized(false);
                }}
              >
                {maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Close compose"
                title="Close"
                onClick={closeCompose}
              >
                <X className="size-4" />
              </Button>
            </div>
          </header>
          {!minimized && (
            <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <label htmlFor="gmail-compose-to" className="shrink-0 text-sm text-slate-600">
                  To
                </label>
                <Input
                  id="gmail-compose-to"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="Recipients"
                  autoComplete="off"
                  className="h-10 min-w-0 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
                />
                {!showCc && (
                  <button
                    type="button"
                    className="text-sm text-slate-600 hover:underline"
                    onClick={() => setShowCc(true)}
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    className="text-sm text-slate-600 hover:underline"
                    onClick={() => setShowBcc(true)}
                  >
                    Bcc
                  </button>
                )}
              </div>
              {showCc && (
                <RecipientRow label="Cc" value={cc} onChange={setCc} id="gmail-compose-cc" />
              )}
              {showBcc && (
                <RecipientRow label="Bcc" value={bcc} onChange={setBcc} id="gmail-compose-bcc" />
              )}
              <Input
                aria-label="Subject"
                placeholder="Subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="h-12 shrink-0 rounded-none border-0 border-b px-4 shadow-none focus-visible:ring-0"
              />
              <EmailRichTextEditor
                ref={editorRef}
                id="gmail-compose-body"
                value={body}
                onChange={setBody}
                rows={12}
                toolbarPlacement="bottom"
                showToolbar={showFormatting && !plainTextOnly}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-none border-0"
              />
              {attachments.length > 0 && (
                <ul className="flex max-h-20 shrink-0 flex-wrap gap-2 overflow-y-auto border-t px-3 py-2">
                  {attachments.map((attachment, index) => (
                    <li
                      key={`${attachment.name}-${index}`}
                      className="flex max-w-full items-center gap-2 rounded border bg-slate-50 px-2 py-1 text-xs"
                    >
                      <span className="max-w-56 truncate">{attachment.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${attachment.name}`}
                        className="text-slate-500 hover:text-destructive"
                        onClick={() =>
                          setAttachments((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p role="alert" className="border-t px-4 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <footer className="relative flex shrink-0 flex-wrap items-center gap-1 border-t px-3 py-2">
                <div className="flex shrink-0">
                  <Button
                    type="submit"
                    className="rounded-r-none"
                    disabled={sending || readingAttachments || !to.trim()}
                  >
                    <Send className="mr-2 size-4" />
                    {sending ? "Sending…" : "Send"}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    className="w-9 rounded-l-none border-l border-white/30"
                    aria-label="Send options"
                    aria-expanded={showSendMenu}
                    title="Send options"
                    onClick={() => setShowSendMenu((current) => !current)}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
                {showSendMenu && (
                  <div className="absolute bottom-full left-3 mb-2 w-64 rounded-md border bg-white p-2 text-sm shadow-lg">
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
                      onClick={() => {
                        setShowSendMenu(false);
                        setError(
                          "Scheduled sending needs a server-side delivery queue, which is not configured for this app.",
                        );
                      }}
                    >
                      Schedule send
                    </button>
                    <p className="px-3 pb-2 text-xs text-slate-500">
                      Not available until scheduled delivery is configured.
                    </p>
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Toggle formatting options"
                  aria-pressed={showFormatting}
                  title="Formatting options"
                  onClick={() => setShowFormatting((current) => !current)}
                >
                  <Type className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Attach files"
                  title="Attach files"
                  disabled={readingAttachments}
                  onClick={() => attachmentInput.current?.click()}
                >
                  <Paperclip className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Insert link"
                  title="Insert link"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={insertLink}
                >
                  <Link2 className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Insert emoji"
                  title="Insert emoji"
                  onClick={() => setShowEmoji((current) => !current)}
                >
                  <Smile className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Attach from Google Drive"
                  title="Google Drive attachments are not configured"
                  onClick={() =>
                    setError(
                      "Google Drive attachments need separate Drive OAuth access and Picker configuration.",
                    )
                  }
                >
                  <Cloud className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Insert photo"
                  title={
                    plainTextOnly ? "Turn off plain text mode to insert a photo" : "Insert photo"
                  }
                  disabled={plainTextOnly}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => photoInput.current?.click()}
                >
                  <ImagePlus className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Confidential mode"
                  title="Confidential mode is not supported by the Gmail API"
                  onClick={() =>
                    setError(
                      "Gmail Confidential Mode is not available through the Gmail API used by this app.",
                    )
                  }
                >
                  <LockKeyhole className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Insert signature"
                  aria-expanded={showSignatureMenu}
                  title="Insert signature"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setShowSignatureMenu((current) => !current);
                    setShowMoreMenu(false);
                  }}
                >
                  <PenLine className="size-4" />
                </Button>
                {showSignatureMenu && (
                  <div className="absolute bottom-full left-64 mb-2 w-56 rounded-md border bg-white p-2 text-sm shadow-lg">
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
                      onClick={insertSignature}
                    >
                      {signature.trim() ? "Insert saved signature" : "No saved signature"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
                      onClick={editSignature}
                    >
                      Create or edit signature…
                    </button>
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="More compose options"
                  aria-expanded={showMoreMenu}
                  title="More options"
                  onClick={() => {
                    setShowMoreMenu((current) => !current);
                    setShowSignatureMenu(false);
                  }}
                >
                  <MoreVertical className="size-4" />
                </Button>
                {showMoreMenu && (
                  <div className="absolute bottom-full right-10 mb-2 w-56 rounded-md border bg-white p-2 text-sm shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-slate-100"
                      aria-pressed={plainTextOnly}
                      onClick={() => {
                        setPlainTextOnly((current) => !current);
                        setShowMoreMenu(false);
                        setShowFormatting(false);
                        setError("");
                      }}
                    >
                      <span>Plain text mode</span>
                      <span>{plainTextOnly ? "✓" : ""}</span>
                    </button>
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
                      onClick={() => {
                        setShowMoreMenu(false);
                        printDraft();
                      }}
                    >
                      Print draft
                    </button>
                  </div>
                )}
                {showEmoji && (
                  <div
                    aria-label="Emoji picker"
                    className="absolute bottom-full left-28 mb-1 grid grid-cols-8 gap-1 rounded-lg border bg-white p-2 shadow-lg"
                  >
                    {[
                      "😀",
                      "😊",
                      "😂",
                      "😍",
                      "👍",
                      "🙏",
                      "🎉",
                      "❤️",
                      "✈️",
                      "🌍",
                      "☀️",
                      "🏨",
                      "🍽️",
                      "📅",
                      "✅",
                      "✨",
                    ].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="size-8 rounded hover:bg-slate-100"
                        aria-label={`Insert ${emoji}`}
                        onClick={() => {
                          editorRef.current?.insertText(emoji);
                          setShowEmoji(false);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) editorRef.current?.insertImageFile(file);
                  }}
                />
                <input
                  ref={attachmentInput}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    void addAttachments(files);
                  }}
                />
                <span className="mr-auto text-xs text-slate-500">
                  {readingAttachments ? "Adding attachments…" : ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Discard draft"
                  title="Discard draft"
                  onClick={discardDraft}
                >
                  <Trash2 className="size-4" />
                </Button>
              </footer>
            </form>
          )}
        </section>
      )}
    </>
  );
}

function RecipientRow({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <label htmlFor={id} className="shrink-0 text-sm text-slate-600">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Recipients"
        autoComplete="off"
        className="h-10 min-w-0 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

async function fileToEmailAttachment(file: File): Promise<EmailAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    data: btoa(binary),
  };
}
