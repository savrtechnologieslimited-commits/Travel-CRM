import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { useActivityLogs, useProfiles } from "@/lib/data";
import { exportCsv, formatDateTime, titleize } from "@/lib/crm";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Audit trail of every lead, quotation, booking and payment change with actor and timestamp.",
      },
      { property: "og:title", content: "Activity Log — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Who changed what and when, across the whole travel pipeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

const ENTITIES = [
  "all",
  "lead",
  "enquiry",
  "quotation",
  "booking",
  "payment",
  "document",
  "customer",
  "task",
] as const;

function ActivityPage() {
  const [entity, setEntity] = useState<string>("all");
  const logs = useActivityLogs(entity);
  const profiles = useProfiles();
  const actorName = (id?: string | null) =>
    (id && profiles.data?.find((p) => p.id === id)?.full_name) || "System";

  return (
    <div>
      <PageHeader
        title="Activity Log"
        subtitle="Audit trail across leads, quotations, bookings, payments and documents."
        actions={
          <div className="flex gap-2">
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITIES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e === "all" ? "All modules" : titleize(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!logs.data?.length}
              onClick={() =>
                exportCsv(
                  "activity-log",
                  (logs.data ?? []).map((l) => ({
                    Time: formatDateTime(l.created_at),
                    Module: l.entity_type,
                    Action: l.action,
                    Summary: l.summary ?? "",
                    Actor: actorName(l.actor_id),
                  })),
                )
              }
            >
              Export CSV
            </Button>
          </div>
        }
      />

      <Card className="divide-y divide-border">
        {(logs.data ?? []).map((l) => (
          <div key={l.id} className="flex items-start gap-3 p-4">
            <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-muted">
              <Activity className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{titleize(l.action)}</p>
                <Badge variant="outline" className="text-[11px]">
                  {titleize(l.entity_type)}
                </Badge>
              </div>
              {l.summary && <p className="mt-1 text-sm text-muted-foreground">{l.summary}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {actorName(l.actor_id)} · {formatDateTime(l.created_at)}
              </p>
            </div>
          </div>
        ))}
        {logs.data?.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            No activity recorded for this filter yet.
          </p>
        )}
      </Card>
    </div>
  );
}
