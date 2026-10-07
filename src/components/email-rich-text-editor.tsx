import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Bold, ImagePlus, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_INLINE_IMAGE_BYTES, sanitizeEmailHtml, toEmailHtml } from "@/lib/email-content";

type EmailRichTextEditorProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
  toolbarPlacement?: "top" | "bottom";
  showToolbar?: boolean;
};

export type EmailRichTextEditorHandle = {
  insertText: (text: string) => void;
  insertLink: (url: string) => void;
  insertImageFile: (file: File) => void;
};

const commands = [
  { command: "bold", label: "Bold", icon: Bold },
  { command: "italic", label: "Italic", icon: Italic },
  { command: "underline", label: "Underline", icon: Underline },
  { command: "insertUnorderedList", label: "Bulleted list", icon: List },
  { command: "insertOrderedList", label: "Numbered list", icon: ListOrdered },
] as const;

export const EmailRichTextEditor = forwardRef<EmailRichTextEditorHandle, EmailRichTextEditorProps>(
  function EmailRichTextEditor(
    { id, value, onChange, rows = 10, className, toolbarPlacement = "top", showToolbar = true },
    forwardedRef,
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const [error, setError] = useState("");
    const minHeight = Math.max(100, rows * 22);

    const saveSelection = useCallback(() => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }, []);

    const restoreSelection = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const selection = window.getSelection();
      const savedRange = savedRangeRef.current;
      if (selection && savedRange && editor.contains(savedRange.commonAncestorContainer)) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, []);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || editor === document.activeElement) return;
      const safeHtml = sanitizeEmailHtml(toEmailHtml(value));
      if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;
    }, [value]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        insertText(text) {
          const editor = editorRef.current;
          if (!editor) return;
          restoreSelection();
          document.execCommand("insertText", false, text);
          onChange(editor.innerHTML);
        },
        insertLink(url) {
          restoreSelection();
          document.execCommand("createLink", false, url);
          if (editorRef.current) onChange(editorRef.current.innerHTML);
        },
        insertImageFile(file) {
          insertImage(file);
        },
      }),
      [insertImage, onChange, restoreSelection],
    );

    const runCommand = useCallback(
      (command: string, commandValue?: string) => {
        restoreSelection();
        document.execCommand(command, false, commandValue);
        if (editorRef.current) onChange(editorRef.current.innerHTML);
      },
      [onChange, restoreSelection],
    );

    const insertImage = useCallback(
      (file: File) => {
        setError("");
        if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
          setError("Choose a PNG, JPEG, GIF, or WebP image.");
          return;
        }
        if (file.size > MAX_INLINE_IMAGE_BYTES) {
          setError("Inline images must be 512 KB or smaller.");
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => setError("Could not read the selected image.");
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            setError("Could not read the selected image.");
            return;
          }
          runCommand(
            "insertHTML",
            `<img src="${reader.result}" alt="${escapeAttribute(file.name)}" style="max-width:100%;height:auto">`,
          );
        };
        reader.readAsDataURL(file);
      },
      [runCommand],
    );

    return (
      <div className={cn("overflow-hidden rounded-md border bg-background", className)}>
        {showToolbar && toolbarPlacement === "top" && (
          <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-1">
            {commands.map(({ command, label, icon: Icon }) => (
              <Button
                key={command}
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={label}
                title={label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runCommand(command)}
              >
                <Icon className="size-4" />
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Insert link"
              title="Insert link"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const url = window.prompt("Enter a web link (https://...)");
                if (!url) return;
                try {
                  const parsed = new URL(url);
                  if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
                    setError("Use an https, http, or email link.");
                    return;
                  }
                } catch {
                  setError("Enter a valid link.");
                  return;
                }
                setError("");
                runCommand("createLink", url);
              }}
            >
              <Link2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Insert inline image"
              title="Insert inline image"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
            </Button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) insertImage(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
        )}
        <div
          id={id}
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={id}
          className={`overflow-y-auto px-3 py-2 text-sm outline-none [&_img]:max-w-full [&_a]:text-primary [&_a]:underline ${toolbarPlacement === "bottom" ? "flex-1" : ""}`}
          style={{ minHeight }}
          onInput={(event) => onChange(event.currentTarget.innerHTML)}
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
          onPaste={(event) => {
            event.preventDefault();
            const pastedHtml = event.clipboardData.getData("text/html");
            if (pastedHtml) {
              document.execCommand("insertHTML", false, sanitizeEmailHtml(pastedHtml));
            } else {
              const text = event.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
            }
            if (editorRef.current) {
              onChange(editorRef.current.innerHTML);
              saveSelection();
            }
          }}
          onKeyUp={() => setError("")}
        />
        {showToolbar && toolbarPlacement === "bottom" && (
          <div className="flex flex-wrap items-center gap-1 border-t bg-muted/30 p-1">
            {commands.map(({ command, label, icon: Icon }) => (
              <Button
                key={command}
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={label}
                title={label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runCommand(command)}
              >
                <Icon className="size-4" />
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Insert link"
              title="Insert link"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const url = window.prompt("Enter a web link (https://...)");
                if (!url) return;
                try {
                  const parsed = new URL(url);
                  if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
                    setError("Use an https, http, or email link.");
                    return;
                  }
                } catch {
                  setError("Enter a valid link.");
                  return;
                }
                setError("");
                runCommand("createLink", url);
              }}
            >
              <Link2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Insert inline image"
              title="Insert inline image"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
            </Button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) insertImage(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="border-t px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  },
);

EmailRichTextEditor.displayName = "EmailRichTextEditor";

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}
