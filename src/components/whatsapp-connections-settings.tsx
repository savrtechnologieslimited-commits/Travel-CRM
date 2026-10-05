import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Link2, MessageCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConnectionStatus = "not_connected" | "pending" | "connected" | "error" | "disconnected";

type ConnectionRow = {
  id: string;
  tenant_id: string;
  business_name: string | null;
  meta_business_id: string | null;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  connection_status: ConnectionStatus;
  onboarding_status: string;
  webhook_status: string;
  last_connected_at: string | null;
  last_webhook_at: string | null;
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  not_connected: "Not Connected",
  pending: "Pending",
  connected: "Connected",
  error: "Error",
  disconnected: "Not Connected",
};

function statusVariant(status: ConnectionStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "default";
  if (status === "pending") return "secondary";
  if (status === "error") return "destructive";
  return "outline";
}

export function WhatsAppConnectionsSettings() {
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const connections = useQuery({
    queryKey: ["whatsapp-connections-metadata"],
    queryFn: async () => {
      // Explicit safe-column allowlist: access_token_secret_ref is never
      // selected or sent to the browser.
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .select("id,tenant_id,business_name,meta_business_id,waba_id,phone_number_id,display_phone_number,connection_status,onboarding_status,webhook_status,last_connected_at,last_webhook_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConnectionRow[];
    },
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><MessageCircle className="size-5" /></div>
          <div>
            <h2 className="font-semibold">WhatsApp Connections</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage the WhatsApp Business number used for customer conversations. Connection onboarding is not configured yet; this screen will not create a fake connection.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowConnectDialog(true)}>
          <Link2 className="mr-2 size-4" /> Connect WhatsApp
        </Button>
      </Card>

      <Card className="flex gap-3 border-amber-500/30 bg-amber-500/5 p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <p className="text-sm text-muted-foreground">
          Meta onboarding is not configured. This registry is metadata-only and does not represent a live connection until credentials and a business phone number are configured.
        </p>
      </Card>

      {connections.isLoading && <Card className="p-5 text-sm text-muted-foreground">Loading WhatsApp connection registry…</Card>}
      {connections.isError && <Card className="p-5 text-sm text-destructive">Connection registry could not be loaded. No connection status is assumed.</Card>}
      {!connections.isLoading && !connections.isError && connections.data?.length === 0 && (
        <Card className="space-y-3 p-6 text-center">
          <Badge variant="outline" className="mx-auto">Not Connected</Badge>
          <p className="text-sm text-muted-foreground">No WhatsApp Business connections have been configured.</p>
          <p className="text-xs text-muted-foreground">Your existing Travel CRM conversations and deterministic travel flow remain available.</p>
        </Card>
      )}
      {connections.data?.map((connection) => (
        <Card key={connection.id} className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{connection.business_name || "WhatsApp Business"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{connection.display_phone_number || "Phone number not onboarded"}</p>
            </div>
            <Badge variant={statusVariant(connection.connection_status)}>{STATUS_LABELS[connection.connection_status]}</Badge>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">WABA</dt><dd>{connection.waba_id || "Not available"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Business ID</dt><dd>{connection.meta_business_id || "Not available"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Onboarding</dt><dd>{connection.onboarding_status}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Webhook</dt><dd>{connection.webhook_status}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Last connected</dt><dd>{connection.last_connected_at ? new Date(connection.last_connected_at).toLocaleString() : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Last webhook</dt><dd>{connection.last_webhook_at ? new Date(connection.last_webhook_at).toLocaleString() : "—"}</dd></div>
          </dl>
          {connection.connection_status === "error" && <p className="text-sm text-destructive">The connection reported an error. Detailed provider text is hidden until it can be safely redacted.</p>}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Access credentials are never requested or displayed in this screen.</p>
        </Card>
      ))}

      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>WhatsApp onboarding is not configured</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>No connection has been created. Meta Embedded Signup and its Tech Provider callback are not implemented in this CRM yet.</p>
            <p>This action did not contact Meta, create a WABA connection, or change any phone number.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
