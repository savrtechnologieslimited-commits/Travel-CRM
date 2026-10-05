import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useEnquiries } from "@/lib/data";
import { formatDate, formatMoney, titleize } from "@/lib/crm";
import {
  ENQUIRY_PIPELINE_STAGES,
  canTransitionEnquiryStatus,
  getEnquiryPipelineStage,
  getEnquiryStageLabel,
} from "@/lib/enquiry-pipeline";
import { PageHeader } from "@/components/app-shell";
import { NewEnquiryDialog } from "@/components/entity-dialogs";
import { StatusBadge } from "@/components/status-badge";
import { EnquiryConvertActions } from "@/components/convert-actions";
import { AssigneeSelect, OwnerFilter, useCanAssign } from "@/components/assignee-select";
import { WhatsAppChatDialog } from "@/components/whatsapp-inbox";
import { useUpsert } from "@/lib/data";
import { useCurrentUser } from "@/lib/ops-data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ENQUIRY_STAGE_OPTIONS = ENQUIRY_PIPELINE_STAGES.map((stage) => ({
  value: stage,
  label: getEnquiryStageLabel(stage),
}));

export const Route = createFileRoute("/_authenticated/enquiries")({
  head: () => ({
    meta: [
      { title: "Enquiries — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Detailed travel requirements: dates, nights, pax, hotel category and budget per enquiry.",
      },
      { property: "og:title", content: "Enquiries — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Travel requirements captured for quotation and itinerary planning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EnquiriesPage,
});

function EnquiriesPage() {
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const { data: user } = useCurrentUser();
  const { canAssign } = useCanAssign();
  const updateEnquiry = useUpsert("enquiries", "Enquiry");
  const { data: enquiries = [], isLoading } = useEnquiries(status, {
    owner,
    ownerId: user?.id ?? null,
  });

  const pipelineCounts = useMemo(() => {
    return ENQUIRY_STAGE_OPTIONS.reduce<Record<string, number>>((acc, option) => {
      acc[option.value] = enquiries.filter((e) => getEnquiryPipelineStage(e.status) === option.value).length;
      return acc;
    }, {});
  }, [enquiries]);

  return (
    <div>
      <PageHeader
        title="Enquiries"
        subtitle="Travel requirements mapped from first enquiry to confirmed trip."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/follow-ups">Reminders</a>
            </Button>
            <NewEnquiryDialog />
          </div>
        }
      />

      <div className="mb-4 rounded-xl border bg-card p-2">
        <Tabs value={status === "all" ? "all" : status} onValueChange={(value) => setStatus(value)}>
          <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
            <TabsTrigger value="all" className="whitespace-nowrap">
              All
            </TabsTrigger>
            {ENQUIRY_STAGE_OPTIONS.map((option) => (
              <TabsTrigger key={option.value} value={option.value} className="whitespace-nowrap">
                {option.label}
                <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {pipelineCounts[option.value] ?? 0}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All enquiries</SelectItem>
              {ENQUIRY_STAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <OwnerFilter value={owner} onChange={setOwner} mineLabel="My enquiries" />
      </div>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Trip</TableHead>
              <TableHead>Pax</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9}>Loading enquiries…</TableCell>
              </TableRow>
            )}
            {!isLoading && enquiries.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>No enquiries found.</TableCell>
              </TableRow>
            )}
            {enquiries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <p className="font-medium">{e.customers?.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.code} · {titleize(e.scope)}
                  </p>
                </TableCell>
                <TableCell>{e.destinations?.name ?? "—"}</TableCell>
                <TableCell>
                  {formatDate(e.departure_date)} → {formatDate(e.return_date)}
                  <span className="block text-xs text-muted-foreground">{e.nights ?? 0} nights</span>
                </TableCell>
                <TableCell>
                  {e.adults ?? 0}A · {e.children ?? 0}C
                  <span className="block text-xs text-muted-foreground">
                    {formatMoney(e.total_budget, e.currency ?? "INR")}
                  </span>
                </TableCell>
                <TableCell>
                  <WhatsAppChatDialog
                    context={{
                      enquiryId: e.id,
                      customerId: e.customer_id,
                      phoneNumber: null,
                      customerName: e.customers?.full_name ?? "Customer",
                      destination: e.destinations?.name ?? "Unknown",
                      status: e.status,
                    }}
                    trigger={
                      <button type="button" className="text-sm text-primary hover:underline">
                        Chat
                      </button>
                    }
                  />
                </TableCell>
                <TableCell>
                  <AssigneeSelect
                    className="w-36"
                    value={e.assigned_to}
                    disabled={!canAssign}
                    onChange={(v) => updateEnquiry.mutate({ id: e.id, values: { assigned_to: v } })}
                  />
                </TableCell>
                <TableCell className="max-w-56 text-xs text-muted-foreground">
                  <span className="line-clamp-2">{e.requirements ?? "No requirement notes yet."}</span>
                </TableCell>
                <TableCell>
                  <Select
                    value={getEnquiryPipelineStage(e.status)}
                    onValueChange={(nextStage) => {
                      const currentStage = getEnquiryPipelineStage(e.status);
                      if (!canTransitionEnquiryStatus(currentStage, nextStage)) return;
                      updateEnquiry.mutate({ id: e.id, values: { status: nextStage } });
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENQUIRY_STAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <EnquiryConvertActions enquiryId={e.id} hasCustomer={Boolean(e.customer_id)} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
