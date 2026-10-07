import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLeads } from "@/lib/data";
import { formatDate, formatMoney, titleize } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { LeadNoteDialog } from "@/components/lead-note-dialog";
import { LeadReminderDialog } from "@/components/lead-reminder-dialog";
import { LeadSupplierEmailDialog } from "@/components/lead-supplier-email-dialog";
import { LeadSendProposalDialog } from "@/components/lead-send-proposal-dialog";
import { OwnerFilter, useAssigneeNames } from "@/components/assignee-select";
import { useCurrentUser } from "@/lib/ops-data";
import { WacrmContactMatchLink } from "@/components/wacrm-contact-match-link";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowRightLeft, Eye, MessageSquareText, PencilLine, Trash2 } from "lucide-react";

export const LEAD_STATUS_TABS = [
  { value: "new", label: "New Enquiry" },
  { value: "in_progress", label: "In Progress" },
  { value: "quotation_sent", label: "Proposal Sent" },
  { value: "discontinued", label: "Discontinued" },
] as const;

export type LeadStatusTabValue = (typeof LEAD_STATUS_TABS)[number]["value"];

export function getLeadStatusValue(value?: string | null): LeadStatusTabValue | null {
  if (value === "converted") return null;
  if (["lost", "cancelled"].includes(value ?? "")) return "discontinued";
  if (value === "new" || !value) return "new";
  if (value === "quotation_sent") return "quotation_sent";
  return "in_progress";
}

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({
    meta: [
      { title: "Leads Pipeline — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Track travel leads from WhatsApp, Instagram, website and referrals through the sales pipeline.",
      },
      { property: "og:title", content: "Leads Pipeline — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Travel enquiry leads across domestic and international trips.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatusTabValue>("new");
  const [owner, setOwner] = useState("all");
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const nameOf = useAssigneeNames();
  const moveLead = useMutation({
    mutationFn: async ({
      leadId,
      nextStatus,
    }: {
      leadId: string;
      nextStatus: "contacted" | "quotation_sent" | "cancelled";
    }) => {
      const { error } = await supabase
        .from("leads")
        .update({ status: nextStatus } as never)
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(
        variables.nextStatus === "contacted"
          ? "Lead moved to In Progress"
          : variables.nextStatus === "quotation_sent"
            ? "Lead moved to Proposal Sent"
            : "Lead discontinued",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const { data: allLeads = [], isLoading } = useLeads({
    search,
    owner,
    ownerId: user?.id ?? null,
  });
  const leads = allLeads.filter((lead) => getLeadStatusValue(lead.status) === status);

  const counts = useMemo(
    () =>
      LEAD_STATUS_TABS.reduce(
        (acc, tab) => {
          acc[tab.value] = allLeads.filter(
            (lead) => getLeadStatusValue(lead.status) === tab.value,
          ).length;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [allLeads],
  );

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Every enquiry from first touch to confirmation."
        actions={<NewLeadDialog />}
      />

      <div className="mb-4 rounded-xl border bg-card p-2">
        <Tabs value={status} onValueChange={(value) => setStatus(value as LeadStatusTabValue)}>
          <TabsList className="h-auto w-full justify-start overflow-x-auto p-1">
            {LEAD_STATUS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="whitespace-nowrap rounded-md border bg-white px-6 py-3 text-sm font-medium text-slate-600 data-[state=active]:border-sky-200 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700"
              >
                {tab.label}
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {counts[tab.value] ?? 0}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Input
            placeholder="Search by customer name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <OwnerFilter value={owner} onChange={setOwner} mineLabel="My leads" />
      </div>

      <Card className="overflow-x-auto border border-slate-200 bg-white p-0 shadow-none">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="min-w-[150px] font-semibold text-slate-700">
                Lead Name
              </TableHead>
              <TableHead className="min-w-[120px] font-semibold text-slate-700">
                Trip name
              </TableHead>
              <TableHead className="min-w-[120px] font-semibold text-slate-700">
                Created Time
              </TableHead>
              <TableHead className="min-w-[120px] font-semibold text-slate-700">
                Trip Start Date
              </TableHead>
              <TableHead className="min-w-[120px] font-semibold text-slate-700">
                Trip End Date
              </TableHead>
              <TableHead className="min-w-[140px] font-semibold text-slate-700">
                Client WhatsApp
              </TableHead>
              <TableHead className="min-w-[130px] font-semibold text-slate-700">
                Team Member
              </TableHead>
              <TableHead className="min-w-[100px] font-semibold text-slate-700">Source</TableHead>
              <TableHead className="min-w-[100px] font-semibold text-slate-700">Lead Id</TableHead>
              <TableHead className="min-w-[140px] text-right font-semibold text-slate-700">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                  Loading leads…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                  No leads found.
                </TableCell>
              </TableRow>
            )}
            {leads.map((lead) => (
              <TableRow key={lead.id} className="border-t border-slate-200 hover:bg-slate-50/60">
                <TableCell className="py-3 align-middle">
                  <div className="flex items-center gap-2">
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: lead.id }}
                      className="font-medium text-slate-700 hover:underline"
                    >
                      {lead.customer_name}
                    </Link>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-600">
                      {lead.customer_name?.charAt(0)?.toUpperCase() ?? "L"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-3 text-slate-600">
                  {lead.destination_text ?? lead.destinations?.name ?? "—"}
                </TableCell>
                <TableCell className="py-3 text-slate-600">
                  {lead.lead_date ? formatDate(lead.lead_date) : "—"}
                </TableCell>
                <TableCell className="py-3 text-slate-600">
                  {lead.travel_start ? formatDate(lead.travel_start) : "—"}
                </TableCell>
                <TableCell className="py-3 text-slate-600">
                  {lead.travel_end ? formatDate(lead.travel_end) : "—"}
                </TableCell>
                <TableCell className="py-3 text-slate-600">{lead.mobile ?? "—"}</TableCell>
                <TableCell className="py-3 text-slate-600">
                  {nameOf(lead.assigned_to) || "Unassigned"}
                </TableCell>
                <TableCell className="py-3">
                  {lead.source === "whatsapp" ? (
                    <WacrmContactMatchLink
                      recordType="lead"
                      recordId={lead.id}
                      disabled={!lead.mobile && !lead.whatsapp}
                      trigger={titleize(lead.source)}
                    />
                  ) : (
                    <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {titleize(lead.source)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-3 text-slate-600">{lead.code ?? "—"}</TableCell>
                <TableCell className="py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-600 hover:text-sky-700"
                      asChild
                    >
                      <Link to="/leads/$leadId" params={{ leadId: lead.id }} aria-label="View lead">
                        <Eye className="size-4" />
                      </Link>
                    </Button>
                    <NewLeadDialog
                      record={lead}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-600 hover:text-sky-700"
                          aria-label="Edit lead"
                        >
                          <PencilLine className="size-4" />
                        </Button>
                      }
                    />
                    <LeadNoteDialog leadId={lead.id} />
                    <LeadReminderDialog
                      leadId={lead.id}
                      customerName={lead.customer_name}
                      mobile={lead.mobile}
                      destination={lead.destination_text ?? lead.destinations?.name ?? null}
                      travelStart={lead.travel_start}
                      travelEnd={lead.travel_end}
                      assignedTo={lead.assigned_to}
                      status={lead.status}
                    />
                    {status === "in_progress" && (
                      <LeadSendProposalDialog
                        lead={{
                          id: lead.id,
                          customer_name: lead.customer_name,
                          email: lead.email,
                          mobile: lead.mobile,
                          destination_text:
                            lead.destination_text ?? lead.destinations?.name ?? null,
                          travel_start: lead.travel_start,
                          travel_end: lead.travel_end,
                        }}
                      />
                    )}
                    <LeadSupplierEmailDialog
                      lead={{
                        id: lead.id,
                        code: lead.code,
                        customer_name: lead.customer_name,
                        assigned_to: lead.assigned_to,
                        destination: lead.destination_text ?? lead.destinations?.name ?? null,
                        travel_start: lead.travel_start,
                        travel_end: lead.travel_end,
                        special_requirements: lead.special_requirements,
                      }}
                    />
                    <WacrmContactMatchLink
                      recordType="lead"
                      recordId={lead.id}
                      compact
                      disabled={!lead.mobile && !lead.whatsapp}
                      trigger={<MessageSquareText className="size-4" />}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={moveLead.isPending}
                          aria-label={`Move ${lead.customer_name}`}
                        >
                          <ArrowRightLeft className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Move lead to</DropdownMenuLabel>
                        <DropdownMenuItem
                          disabled={
                            getLeadStatusValue(lead.status) === "in_progress" || moveLead.isPending
                          }
                          onSelect={() =>
                            moveLead.mutate({ leadId: lead.id, nextStatus: "contacted" })
                          }
                        >
                          <ArrowRightLeft className="size-4" />
                          In Progress
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={
                            getLeadStatusValue(lead.status) === "quotation_sent" ||
                            moveLead.isPending
                          }
                          onSelect={() =>
                            moveLead.mutate({ leadId: lead.id, nextStatus: "quotation_sent" })
                          }
                        >
                          <ArrowRightLeft className="size-4" />
                          Proposal Sent
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={
                            getLeadStatusValue(lead.status) === "discontinued" || moveLead.isPending
                          }
                          onSelect={() =>
                            moveLead.mutate({ leadId: lead.id, nextStatus: "cancelled" })
                          }
                        >
                          <Trash2 className="size-4" />
                          Discontinued
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>{isLoading ? "Loading leads…" : `${leads.length} leads`}</span>
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-700">Budget</span>
          <span>
            {formatMoney(
              leads.reduce((sum, lead) => sum + Number(lead.budget ?? 0), 0),
              "INR",
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
