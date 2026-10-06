import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import {
  EmailRichTextEditor,
  type EmailRichTextEditorHandle,
} from "@/components/email-rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSettings, useSaveAppSetting } from "@/lib/data";
import {
  DEFAULT_SUPPLIER_EMAIL_TEMPLATE,
  readSupplierEmailTemplate,
  SUPPLIER_EMAIL_PLACEHOLDERS,
  type SupplierEmailTemplate,
} from "@/lib/supplier-email-template";

type EditableField = keyof SupplierEmailTemplate;

export function SupplierEmailTemplateDialog() {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_SUPPLIER_EMAIL_TEMPLATE);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<EmailRichTextEditorHandle>(null);
  const signatureRef = useRef<EmailRichTextEditorHandle>(null);
  const { data: settings = [] } = useAppSettings();
  const saveSetting = useSaveAppSetting();
  const templateSetting = settings.find(
    (setting) => setting.key === "supplier_email_template",
  )?.value;
  const savedTemplate = useMemo(
    () => readSupplierEmailTemplate(templateSetting),
    [templateSetting],
  );

  useEffect(() => {
    if (open) setTemplate(savedTemplate);
  }, [open, savedTemplate]);

  function insertPlaceholder(field: EditableField, token: string) {
    const placeholder = `{{${token}}}`;
    if (field !== "subject") {
      const editor = field === "body" ? bodyRef.current : signatureRef.current;
      editor?.insertText(placeholder);
      return;
    }
    const input = subjectRef.current;
    if (!input) {
      setTemplate((current) => ({
        ...current,
        subject: `${current.subject}${placeholder}`,
      }));
      return;
    }

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    setTemplate((current) => ({
      ...current,
      subject: `${current.subject.slice(0, start)}${placeholder}${current.subject.slice(end)}`,
    }));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  function save() {
    saveSetting.mutate(
      {
        key: "supplier_email_template",
        value: {
          subject: template.subject,
          body: template.body,
          signature: template.signature,
        },
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings2 className="size-4" />
          Email template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Supplier email template</DialogTitle>
          <DialogDescription>
            This is the default subject and body for supplier emails. Placeholders are replaced with
            enquiry details when you send.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Insert in subject</Label>
            <div className="flex flex-wrap gap-2">
              {SUPPLIER_EMAIL_PLACEHOLDERS.map(({ label, token }) => (
                <Button
                  key={`subject-${token}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full bg-sky-50 px-3 text-xs font-normal text-sky-700"
                  onClick={() => insertPlaceholder("subject", token)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-template-subject">Default subject</Label>
            <Input
              id="supplier-template-subject"
              ref={subjectRef}
              value={template.subject}
              onChange={(event) =>
                setTemplate((current) => ({ ...current, subject: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Insert in email body</Label>
            <div className="flex flex-wrap gap-2">
              {SUPPLIER_EMAIL_PLACEHOLDERS.map(({ label, token }) => (
                <Button
                  key={`body-${token}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-3 text-xs font-normal"
                  onClick={() => insertPlaceholder("body", token)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-template-body">Email body</Label>
            <EmailRichTextEditor
              id="supplier-template-body"
              ref={bodyRef}
              rows={15}
              value={template.body}
              onChange={(body) => setTemplate((current) => ({ ...current, body }))}
            />
          </div>

          <div className="space-y-2 border-t pt-4">
            <div>
              <Label htmlFor="supplier-template-signature">Email signature</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Added to the bottom of every supplier email. Edit it here, or leave it empty to send
                without a signature.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUPPLIER_EMAIL_PLACEHOLDERS.map(({ label, token }) => (
                <Button
                  key={`signature-${token}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-3 text-xs font-normal"
                  onClick={() => insertPlaceholder("signature", token)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <EmailRichTextEditor
              id="supplier-template-signature"
              ref={signatureRef}
              rows={5}
              value={template.signature}
              onChange={(signature) => setTemplate((current) => ({ ...current, signature }))}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saveSetting.isPending}>
              {saveSetting.isPending ? "Saving…" : "Save template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
