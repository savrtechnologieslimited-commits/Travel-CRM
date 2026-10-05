import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Clock3, MessageSquareText, Send, Users } from "lucide-react";
import { useCustomers, useLeads, useMessageTemplates } from "@/lib/data";
import { buildBroadcastAudience, type BroadcastAudienceMode } from "@/lib/broadcasts";
import { renderTemplatePreview } from "@/lib/whatsapp-phase2";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type BroadcastState = {
  id: string;
  title: string;
  status: "Draft" | "Scheduled" | "Queued" | "Sent";
  audience: string;
  recipients: number;
  scheduledFor?: string;
  createdAt: string;
};

const AUDIENCE_OPTIONS: Array<{ value: BroadcastAudienceMode; label: string }> = [
  { value: "all_contacts", label: "All contacts" },
  { value: "customers_only", label: "Customers only" },
  { value: "leads_only", label: "Leads only" },
  { value: "active_leads", label: "Active leads" },
];

const mapBroadcastStatus = (status: string): BroadcastState["status"] => {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "running":
      return "Queued";
    case "completed":
      return "Sent";
    case "cancelled":
      return "Scheduled";
    case "failed":
      return "Queued";
    default:
      return "Draft";
  }
};

export function BroadcastsPanel() {
  const { data: customers = [] } = useCustomers();
  const { data: leads = [] } = useLeads();
  const { data: templates = [] } = useMessageTemplates();

  const [mode, setMode] = useState<BroadcastAudienceMode>("all_contacts");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState("Winter package update");
  const [scheduledFor, setScheduledFor] = useState("");
  const [body, setBody] = useState(
    "Hi {{name}}, we have a fresh travel offer for {{destination}} with departures around {{travel_date}}. Reply to speak with our travel desk.",
  );
  const [history, setHistory] = useState<BroadcastState[]>([]);

  useEffect(() => {
    void (async () => {
      const { data: broadcasts, error: broadcastError } = await supabase
        .from("broadcasts")
        .select("*")
        .order("created_at", { ascending: false });

      if (broadcastError) {
        toast.error("Unable to load saved broadcasts.");
        return;
      }

      const { data: recipients, error: recipientsError } = await supabase
        .from("broadcast_recipients")
        .select("broadcast_id");

      if (recipientsError) {
        toast.error("Unable to load broadcast recipient counts.");
        return;
      }

      const counts = new Map<string, number>();
      for (const row of recipients ?? []) {
        counts.set(row.broadcast_id, (counts.get(row.broadcast_id) ?? 0) + 1);
      }

      setHistory(
        (broadcasts ?? []).map((broadcast) => ({
          id: broadcast.id,
          title: broadcast.title,
          status: mapBroadcastStatus(broadcast.status),
          audience: AUDIENCE_OPTIONS.find((option) => option.value === broadcast.audience_mode)?.label ?? "All contacts",
          recipients: counts.get(broadcast.id) ?? 0,
          scheduledFor: broadcast.scheduled_for ?? undefined,
          createdAt: broadcast.created_at,
        })),
      );
    })();
  }, []);

  const audience = useMemo(
    () => buildBroadcastAudience({ customers, leads, mode }),
    [customers, leads, mode],
  );

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const preview = renderTemplatePreview(
    {
      header: selectedTemplate?.name ?? "Broadcast",
      body: selectedTemplate?.body ?? body,
      footer: "Thanks, SAVR Travels",
    },
    {
      name: "Amit",
      destination: "Dubai",
      travel_date: "2026-11-12",
      agency: "SAVR Travels",
    },
  );

  function applyTemplate(nextId: string) {
    setTemplateId(nextId);
    const template = templates.find((candidate) => candidate.id === nextId);
    if (template?.body) {
      setBody(template.body);
    }
  }

  async function handleQueueBroadcast() {
    const label = title.trim() || "Untitled broadcast";

    const { data: broadcast, error: broadcastError } = await supabase
      .from("broadcasts")
      .insert({
        title: label,
        status: scheduledFor ? "scheduled" : "draft",
        audience_mode: mode,
        template_id: templateId || null,
        body,
        scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        created_by: null,
      })
      .select("*")
      .single();

    if (broadcastError || !broadcast) {
      toast.error("Unable to save this broadcast.");
      return;
    }

    const rows = audience.recipients.map((recipient) => ({
      broadcast_id: broadcast.id,
      recipient_type: recipient.kind,
      recipient_id: recipient.id,
      customer_id: recipient.kind === "customer" ? recipient.id : null,
      lead_id: recipient.kind === "lead" ? recipient.id : null,
      phone: recipient.phone,
      display_name: recipient.name,
      status: "pending",
      failure_reason: null,
      meta_message_id: null,
      sent_at: null,
    }));

    if (rows.length > 0) {
      const { error: recipientsError } = await supabase.from("broadcast_recipients").insert(rows);
      if (recipientsError) {
        toast.error("Broadcast saved, but recipient rows could not be stored.");
        return;
      }
    }

    const nextItem: BroadcastState = {
      id: broadcast.id,
      title: broadcast.title,
      status: mapBroadcastStatus(broadcast.status),
      audience: AUDIENCE_OPTIONS.find((option) => option.value === broadcast.audience_mode)?.label ?? "All contacts",
      recipients: rows.length,
      scheduledFor: broadcast.scheduled_for ?? undefined,
      createdAt: broadcast.created_at,
    };

    setHistory((current) => [nextItem, ...current]);
    toast.success(
      scheduledFor
        ? `Broadcast scheduled for ${new Date(scheduledFor).toLocaleString()}`
        : `Broadcast queued for ${rows.length} recipient${rows.length === 1 ? "" : "s"}`,
    );
    setTitle("");
    setScheduledFor("");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Broadcast composer</p>
            <p className="text-xs text-muted-foreground">Rule-based outreach for customers and leads</p>
          </div>
          <Badge variant="secondary">{audience.summary}</Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Broadcast name</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Family getaway launch" />
          </div>
          <div className="space-y-2">
            <Label>Audience</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as BroadcastAudienceMode)}>
              <SelectTrigger>
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Schedule</Label>
            <Input
              type="datetime-local"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Message body</Label>
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={8} />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground"><Users className="size-3.5" /> {audience.summary}</span>
          <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" /> {scheduledFor ? new Date(scheduledFor).toLocaleString() : "Send now"}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleQueueBroadcast}>
            <Send className="mr-2 size-4" /> {scheduledFor ? "Schedule broadcast" : "Send broadcast"}
          </Button>
          <Button variant="outline" type="button" onClick={() => setBody((current) => `${current}\n\nReply STOP to opt out.`)}>
            Add opt-out footer
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <MessageSquareText className="size-4 text-primary" /> Preview
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap text-muted-foreground">
            {preview || "Message preview will appear here."}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="size-4 text-primary" /> Audience preview
          </div>
          <div className="space-y-2">
            {audience.recipients.slice(0, 6).map((recipient) => (
              <div key={`${recipient.kind}:${recipient.id}`} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
                <span className="font-medium">{recipient.name}</span>
                <Badge variant="outline">{recipient.kind}</Badge>
              </div>
            ))}
            {audience.recipients.length === 0 && <p className="text-xs text-muted-foreground">No valid recipients match this filter.</p>}
          </div>
        </Card>
      </div>

      <Card className="xl:col-span-2 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Broadcast</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Timing</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell>{item.audience}</TableCell>
                <TableCell>{item.recipients}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : new Date(item.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === "Scheduled" ? "secondary" : "outline"}>{item.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
