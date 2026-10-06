import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppSettings, useProfiles, useSuppliersFull } from "@/lib/data";
import { formatDate } from "@/lib/crm";
import { supabase } from "@/integrations/supabase/client";
import { getConnectedMailAccounts, sendSupplierInquiryEmail } from "@/lib/gmail-provider";
import {
  appendSupplierEmailSignature,
  readSupplierEmailTemplate,
  renderSupplierEmailTemplate,
  type SupplierEmailTemplate,
} from "@/lib/supplier-email-template";

export type LeadSupplierEmailDetails = {
  id: string;
  customer_id?: string | null;
  code?: string | null;
  customer_name?: string | null;
  assigned_to?: string | null;
  destination?: string | null;
  travel_start?: string | null;
  travel_end?: string | null;
  special_requirements?: string | null;
};

function renderEmailForSupplier(
  lead: LeadSupplierEmailDetails,
  supplier: { name: string; contact_person: string | null } | undefined,
  profiles: { id: string; full_name: string }[],
  template: SupplierEmailTemplate,
) {
  const rendered = renderSupplierEmailTemplate(template, {
    supplier_name: supplier?.name ?? "",
    contact_name: supplier?.contact_person ?? "",
    client_name: lead.customer_name?.trim() || "Not specified",
    lead_name: lead.customer_name?.trim() || "Not specified",
    crm_lead_id: lead.code?.trim() || "Not specified",
    assigned_team_member:
      profiles.find((profile) => profile.id === lead.assigned_to)?.full_name ??
      (lead.assigned_to ? "Assigned team member" : "Unassigned"),
    destination: lead.destination?.trim() || "Not specified",
    trip_start_date: formatDate(lead.travel_start),
    trip_end_date: formatDate(lead.travel_end),
    client_requirement: lead.special_requirements?.trim() || "No additional requirements recorded.",
  });
  return {
    ...rendered,
    body: appendSupplierEmailSignature(rendered.body, rendered.signature),
  };
}

export function LeadSupplierEmailDialog({ lead }: { lead: LeadSupplierEmailDetails }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<"gmail" | "zoho">("gmail");
  const [supplierId, setSupplierId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const { data: suppliers = [], isLoading: suppliersLoading } = useSuppliersFull();
  const { data: profiles = [] } = useProfiles();
  const { data: settings = [] } = useAppSettings();
  const customerId = lead.customer_id;
  const latestCustomerLead = useQuery({
    queryKey: ["customer-supplier-email-lead", customerId],
    enabled: open && Boolean(customerId),
    queryFn: async () => {
      if (!customerId) return null;
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id,code,customer_name,assigned_to,destination_text,travel_start,travel_end,special_requirements",
        )
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("lead_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const sendEmail = useServerFn(sendSupplierInquiryEmail);
  const loadMailAccounts = useServerFn(getConnectedMailAccounts);
  const { data: mailAccounts = [] } = useQuery({
    queryKey: ["connected-mail-accounts"],
    queryFn: () => loadMailAccounts({ data: undefined }),
    enabled: open,
  });
  const supplierOptions = useMemo(
    () => suppliers.filter((supplier) => supplier.is_active),
    [suppliers],
  );
  const supplier = supplierOptions.find((candidate) => candidate.id === supplierId);
  const templateSetting = settings.find(
    (setting) => setting.key === "supplier_email_template",
  )?.value;
  const savedTemplate = useMemo(
    () => readSupplierEmailTemplate(templateSetting),
    [templateSetting],
  );
  const emailLead = useMemo<LeadSupplierEmailDetails>(
    () =>
      latestCustomerLead.data
        ? {
            ...lead,
            code: latestCustomerLead.data.code,
            customer_name: latestCustomerLead.data.customer_name ?? lead.customer_name,
            assigned_to: latestCustomerLead.data.assigned_to,
            destination: latestCustomerLead.data.destination_text,
            travel_start: latestCustomerLead.data.travel_start,
            travel_end: latestCustomerLead.data.travel_end,
            special_requirements: latestCustomerLead.data.special_requirements,
          }
        : lead,
    [lead, latestCustomerLead.data],
  );

  useEffect(() => {
    if (!open) return;
    const firstSupplier = supplierOptions[0];
    setSupplierId(firstSupplier?.id ?? "");
    setRecipient(firstSupplier?.email?.trim() ?? "");
    setProvider(
      mailAccounts.some((account: { provider: string }) => account.provider === "gmail")
        ? "gmail"
        : "zoho",
    );
    const rendered = renderEmailForSupplier(emailLead, firstSupplier, profiles, savedTemplate);
    setSubject(rendered.subject);
    setBody(rendered.body);
    setError("");
  }, [open, emailLead, supplierOptions, mailAccounts, profiles, savedTemplate]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const recipients = recipient
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
    if (!recipients.length) {
      setError("Enter at least one recipient email address.");
      return;
    }
    setError("");
    try {
      await sendEmail({
        data: {
          provider,
          supplierId: supplierId || null,
          to: recipients.join(", "),
          subject,
          body,
        },
      });
      toast.success(
        supplier
          ? `Inquiry sent to ${recipients.join(", ")}`
          : `Email sent to ${recipients.join(", ")}`,
      );
      setOpen(false);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send supplier email.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-600 hover:text-sky-700"
          aria-label="Email supplier with enquiry details"
          title="Email supplier with enquiry details"
        >
          <Mail className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email supplier</DialogTitle>
          <DialogDescription>
            Select a supplier, review the email populated from your template, then send.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Send from</Label>
            <Select
              value={provider}
              onValueChange={(value) => setProvider(value as "gmail" | "zoho")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select connected account" />
              </SelectTrigger>
              <SelectContent>
                {mailAccounts.map((account: { provider: string; email: string }) => (
                  <SelectItem key={account.provider} value={account.provider}>
                    {account.provider === "gmail" ? "Gmail" : "Zoho Mail"} · {account.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mailAccounts.length === 0 && (
              <p className="text-xs text-destructive">
                Connect Gmail or Zoho Mail in the Mail Accounts page before sending.
              </p>
            )}
            {latestCustomerLead.error && (
              <p role="alert" className="text-sm text-destructive">
                Could not load the customer’s latest trip enquiry
                {latestCustomerLead.error instanceof Error
                  ? `: ${latestCustomerLead.error.message}`
                  : "."}{" "}
                You can still review and edit the message before sending.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Supplier (optional)</Label>
            <Select
              value={supplierId || "manual"}
              onValueChange={(value) => {
                if (value === "manual") {
                  setSupplierId("");
                  setRecipient("");
                  const rendered = renderEmailForSupplier(
                    emailLead,
                    undefined,
                    profiles,
                    savedTemplate,
                  );
                  setSubject(rendered.subject);
                  setBody(rendered.body);
                  return;
                }
                const selected = supplierOptions.find((option) => option.id === value);
                setSupplierId(value);
                setRecipient(selected?.email?.trim() ?? "");
                const rendered = renderEmailForSupplier(
                  emailLead,
                  selected,
                  profiles,
                  savedTemplate,
                );
                setSubject(rendered.subject);
                setBody(rendered.body);
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    suppliersLoading ? "Loading suppliers…" : "Select supplier or enter email"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Other / enter email manually</SelectItem>
                {supplierOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                    {option.email ? ` · ${option.email}` : " · no saved email"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!suppliersLoading && supplierOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No active suppliers are listed. Enter the recipient address below to send directly.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`supplier-email-to-${lead.id}`}>To email</Label>
            <Input
              id={`supplier-email-to-${lead.id}`}
              type="email"
              multiple
              required
              placeholder="supplier@example.com (separate multiple addresses with commas)"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Selecting a supplier fills this field. Edit, add, or remove addresses before sending.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`supplier-email-subject-${lead.id}`}>Subject</Label>
            <Input
              id={`supplier-email-subject-${lead.id}`}
              required
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`supplier-email-body-${lead.id}`}>Email body</Label>
            <Textarea
              id={`supplier-email-body-${lead.id}`}
              required
              rows={16}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Customer contact details, budget, and internal notes are not included automatically.
              Review the details before sending.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
              {(error.includes("Gmail") || error.includes("Zoho Mail")) && (
                <>
                  {" "}
                  —{" "}
                  <a href="/gmail" className="underline">
                    Open Mail Accounts
                  </a>
                </>
              )}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                !mailAccounts.some(
                  (account: { provider: string }) => account.provider === provider,
                ) ||
                !recipient.trim() ||
                !subject.trim() ||
                !body.trim()
              }
            >
              <Send className="mr-2 size-4" /> Send inquiry
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
