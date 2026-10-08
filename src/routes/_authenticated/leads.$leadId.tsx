import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  useCommunications,
  useLead,
  useLeadItineraries,
  useLogCommunication,
  useUpsert,
} from "@/lib/data";
import {
  CHANNELS,
  LEAD_STATUSES,
  formatDate,
  formatDateTime,
  formatMoney,
  titleize,
} from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { LeadConvertActions } from "@/components/convert-actions";
import { AssigneeSelect, useAssigneeNames, useCanAssign } from "@/components/assignee-select";
import { WacrmConversationPanel } from "@/components/wacrm-conversation-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  head: () => ({
    meta: [
      { title: "Lead Detail — SAVR Travels CRM" },
      {
        name: "description",
        content: "Full lead record: requirements, budget, follow-ups and communication history.",
      },
      { property: "og:title", content: "Lead Detail — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Requirements, budget and activity timeline for a travel lead.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const { data: lead, isLoading } = useLead(leadId);
  const {
    data: itineraries = [],
    isLoading: itinerariesLoading,
    isFetching: itinerariesFetching,
    isError: itinerariesError,
    error: itinerariesLoadError,
  } = useLeadItineraries(leadId);
  const { data: activity = [] } = useCommunications(leadId);
  const updateLead = useUpsert("leads", "Lead");
  const logComm = useLogCommunication();
  const { canAssign } = useCanAssign();
  const nameOf = useAssigneeNames();

  const [channel, setChannel] = useState("call");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState("overview");

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading lead…</p>;
  if (!lead) return <p className="text-sm text-muted-foreground">Lead not found.</p>;

  async function logActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await logComm.mutateAsync({
      lead_id: leadId,
      channel,
      direction: "outbound",
      body: note,
      occurred_at: new Date().toISOString(),
      status: "logged",
    });
    setNote("");
  }

  const facts: Array<[string, string]> = [
    ["Mobile", lead.mobile ?? "—"],
    ["Email", lead.email ?? "—"],
    ["Source", titleize(lead.source)],
    ["Scope", titleize(lead.scope)],
    ["Trip name", lead.destination_text ?? lead.destinations?.name ?? "—"],
    ["Travel", formatDate(lead.travel_start)],
    ["Pax", `${lead.adults ?? 0} adults · ${lead.children ?? 0} children`],
    ["Budget", formatMoney(lead.budget, lead.currency ?? "INR")],
    ["Trip type", titleize(lead.trip_type)],
    ["Next follow-up", formatDate(lead.next_follow_up)],
    ["Assigned to", nameOf(lead.assigned_to)],
  ];

  return (
    <div>
      <Link
        to="/leads"
        className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to leads
      </Link>

      <PageHeader
        title={lead.customer_name}
        subtitle={`${lead.code ?? "Lead"} · created ${formatDate(lead.lead_date)}`}
        actions={
          <div className="flex items-center gap-2">
            <LeadConvertActions leadId={leadId} hasCustomer={Boolean(lead.customer_id)} />
            <PriorityBadge priority={lead.priority} />
            <AssigneeSelect
              className="w-48"
              value={lead.assigned_to}
              disabled={!canAssign}
              onChange={(v) => updateLead.mutate({ id: leadId, values: { assigned_to: v } })}
            />
            <Select
              value={lead.status ?? "new"}
              onValueChange={(v) => updateLead.mutate({ id: leadId, values: { status: v } })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {titleize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="quotation">Quotation</TabsTrigger>
          <TabsTrigger value="booking">Booking</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-3">
        {tab === "whatsapp" && <WacrmConversationPanel recordType="lead" recordId={lead.id} />}

        {tab === "overview" && (
          <>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-display text-base">Requirement summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
                    <p className="text-sm font-medium">{value}</p>
                  </div>
                ))}
                {lead.special_requirements && (
                  <div className="sm:col-span-2">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                      Special requirements
                    </p>
                    <p className="text-sm">{lead.special_requirements}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display text-base">Log activity</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={logActivity} className="space-y-3">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {titleize(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="note">Note</Label>
                    <Textarea
                      id="note"
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Shared Bali 5N quote on WhatsApp"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={logComm.isPending}>
                    Save activity
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="font-display text-base">Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {activity.length === 0 && (
                  <p className="text-sm text-muted-foreground">No activity logged yet.</p>
                )}
                {activity.map((a) => (
                  <div key={a.id} className="border-l-2 border-border pl-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={a.channel} />
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(a.occurred_at)} · {titleize(a.direction)}
                      </span>
                    </div>
                    {a.subject && <p className="mt-1 text-sm font-medium">{a.subject}</p>}
                    {a.body && <p className="text-sm text-muted-foreground">{a.body}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {tab === "requirements" && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="font-display text-base">Travel requirements</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Destination</p>
                <p>{lead.destinations?.name ?? lead.destination_text ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Travel dates</p>
                <p>
                  {formatDate(lead.travel_start)} → {formatDate(lead.travel_end)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Pax</p>
                <p>
                  {lead.adults ?? 0} adults · {lead.children ?? 0} children
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Budget</p>
                <p>{formatMoney(lead.budget, lead.currency ?? "INR")}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Trip type</p>
                <p>{titleize(lead.trip_type)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Scope</p>
                <p>{titleize(lead.scope)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Source</p>
                <p>{titleize(lead.source)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Next follow-up</p>
                <p>{formatDate(lead.next_follow_up)}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <p className="text-xs uppercase text-muted-foreground">Client requirement</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {lead.special_requirements ?? "No client requirement recorded."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "itinerary" && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="font-display text-base">Itinerary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {itinerariesLoading && (
                <p className="text-sm text-muted-foreground">Loading assigned itineraries…</p>
              )}
              {itinerariesError && (
                <p role="alert" className="text-sm text-destructive">
                  Could not load itineraries assigned to this lead
                  {itinerariesLoadError instanceof Error
                    ? `: ${itinerariesLoadError.message}`
                    : "."}
                </p>
              )}
              {!itinerariesLoading && !itinerariesError && itineraries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No itineraries assigned to this lead yet.
                </p>
              )}
              {itineraries.length > 0 && (
                <div className="space-y-2">
                  {itineraries.map((itinerary) => (
                    <Link
                      key={itinerary.id}
                      to="/itinerary-builder"
                      search={{ itineraryId: itinerary.id }}
                      className="block rounded-lg border p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">
                            {itinerary.title ?? itinerary.name ?? "Untitled itinerary"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {lead.destination_text ?? "Destination pending"} ·{" "}
                            {itinerary.travel_start_date || itinerary.travel_end_date
                              ? `${itinerary.travel_start_date ? formatDate(itinerary.travel_start_date) : "Dates not set"}${itinerary.travel_end_date ? ` – ${formatDate(itinerary.travel_end_date)}` : ""}`
                              : "Dates not set"}
                          </p>
                        </div>
                        <StatusBadge status={itinerary.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {itinerariesLoading || itinerariesFetching ? (
                  <span className="text-sm text-muted-foreground">Checking itineraries…</span>
                ) : (
                  !itinerariesError && (
                    <Link
                      to="/itinerary-builder"
                      search={
                        itineraries[0] ? { itineraryId: itineraries[0].id } : { leadId: lead.id }
                      }
                      className="text-sm text-primary hover:underline"
                    >
                      {itineraries[0] ? "Open latest itinerary" : "Create itinerary"}
                    </Link>
                  )
                )}
                <Link to="/itinerary-library" className="text-sm text-primary hover:underline">
                  Open library
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "quotation" && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="font-display text-base">Quotations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Use the existing quotation workflow for this lead.
              </p>
              <Link
                to="/quotations"
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                View quotations
              </Link>
            </CardContent>
          </Card>
        )}

        {tab === "booking" && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="font-display text-base">Booking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Use the existing booking records for this lead.
              </p>
              <Link
                to="/bookings"
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                View bookings
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
