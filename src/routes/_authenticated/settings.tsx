import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Save } from "lucide-react";
import {
  useAppSettings,
  useAutomationRules,
  useUpsertAutomationRule,
  useMessageTemplates,
  useProfiles,
  useSaveAppSetting,
  useUpsertTemplate,
} from "@/lib/data";
import { createTravelFlow, evaluateTravelFlowMessage } from "@/lib/whatsapp-phase2";
import { titleize } from "@/lib/crm";
import { DEFAULT_ITINERARY_TERMS } from "@/lib/itinerary-terms-extractor";
import { PageHeader } from "@/components/app-shell";
import { WhatsAppConnectionsSettings } from "@/components/whatsapp-connections-settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { parseValidPhoneNumber } from "@/lib/phone-number";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanAssign } from "@/components/assignee-select";

const WACRM_UNASSIGNED = "unassigned";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Configure agency profile, GST and markup defaults, and WhatsApp or email message templates.",
      },
      { property: "og:title", content: "Settings — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Agency profile, tax defaults and communication templates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type AgencyForm = {
  name: string;
  gstin: string;
  phone: string;
  email: string;
  address: string;
  terms: string;
  default_inclusions: string;
  default_exclusions: string;
  default_cancellation_info: string;
  default_terms_conditions: string;
};

type PricingForm = {
  default_markup_pct: string;
  gst_domestic_pct: string;
  gst_international_pct: string;
  service_charge: string;
  quotation_validity_days: string;
};

const CHANNELS = ["whatsapp", "email", "sms"] as const;

function SettingsPage() {
  const settings = useAppSettings();
  const saveSetting = useSaveAppSetting();
  const templates = useMessageTemplates();
  const upsertTemplate = useUpsertTemplate();
  const profiles = useProfiles();
  const { canAssign } = useCanAssign();

  const agencyValue = settings.data?.find((s) => s.key === "agency")?.value as
    | Partial<AgencyForm>
    | undefined;
  const pricingValue = settings.data?.find((s) => s.key === "pricing")?.value as
    | Partial<Record<keyof PricingForm, number | string>>
    | undefined;
  const wacrmIntegrationValue = settings.data?.find((s) => s.key === "wacrm_integration")?.value as
    { default_assignee_id?: string | null } | undefined;

  const [agency, setAgency] = useState<AgencyForm>({
    name: "SAVR Travels",
    gstin: "",
    phone: "",
    email: "",
    address: "",
    terms: "50% advance to confirm, balance 15 days before departure.",
    default_inclusions: DEFAULT_ITINERARY_TERMS.inclusions,
    default_exclusions: DEFAULT_ITINERARY_TERMS.exclusions,
    default_cancellation_info: DEFAULT_ITINERARY_TERMS.cancellation_info,
    default_terms_conditions: DEFAULT_ITINERARY_TERMS.terms_conditions,
  });
  const [pricing, setPricing] = useState<PricingForm>({
    default_markup_pct: "12",
    gst_domestic_pct: "5",
    gst_international_pct: "5",
    service_charge: "0",
    quotation_validity_days: "7",
  });
  const [wacrmFallbackAssigneeId, setWacrmFallbackAssigneeId] = useState("");

  useEffect(() => {
    if (agencyValue) setAgency((p) => ({
      ...p,
      ...(agencyValue as Partial<AgencyForm>),
      default_terms_conditions: agencyValue.default_terms_conditions ?? agencyValue.terms ?? p.default_terms_conditions,
    }));
  }, [settings.dataUpdatedAt]);

  useEffect(() => {
    setWacrmFallbackAssigneeId(wacrmIntegrationValue?.default_assignee_id ?? "");
  }, [settings.dataUpdatedAt, wacrmIntegrationValue?.default_assignee_id]);

  useEffect(() => {
    if (pricingValue) {
      setPricing((p) => ({
        ...p,
        ...(Object.fromEntries(
          Object.entries(pricingValue).map(([k, v]) => [k, String(v ?? "")]),
        ) as PricingForm),
      }));
    }
  }, [settings.dataUpdatedAt]);

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Agency profile, pricing defaults, message templates and team access."
      />

      <Tabs defaultValue="agency">
        <TabsList>
          <TabsTrigger value="agency">Agency</TabsTrigger>
          <TabsTrigger value="pricing">Pricing & Tax</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="agency" className="mt-4">
          <Card className="max-w-3xl p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Agency name">
                <Input
                  value={agency.name}
                  onChange={(e) => setAgency({ ...agency, name: e.target.value })}
                />
              </Field>
              <Field label="GSTIN">
                <Input
                  value={agency.gstin}
                  onChange={(e) => setAgency({ ...agency, gstin: e.target.value })}
                  placeholder="29ABCDE1234F1Z5"
                />
              </Field>
              <Field label="Phone / WhatsApp">
                <PhoneNumberInput
                  id="agency-phone"
                  value={agency.phone}
                  onChange={(value) => setAgency({ ...agency, phone: value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={agency.email}
                  onChange={(e) => setAgency({ ...agency, email: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Registered address">
                  <Textarea
                    rows={2}
                    value={agency.address}
                    onChange={(e) => setAgency({ ...agency, address: e.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Default quotation terms">
                  <Textarea
                    rows={3}
                    value={agency.terms}
                    onChange={(e) => setAgency({ ...agency, terms: e.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2 border-t pt-4">
                <h3 className="text-sm font-semibold">Default itinerary terms</h3>
                <p className="mt-1 text-xs text-muted-foreground">These are prefilled on new itineraries. Terms found in an uploaded supplier PDF replace the matching defaults.</p>
              </div>
              <div className="sm:col-span-2">
                <Field label="Default inclusions">
                  <Textarea rows={4} value={agency.default_inclusions} onChange={(e) => setAgency({ ...agency, default_inclusions: e.target.value })} placeholder="One inclusion per line" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Default exclusions">
                  <Textarea rows={3} value={agency.default_exclusions} onChange={(e) => setAgency({ ...agency, default_exclusions: e.target.value })} placeholder="One exclusion per line" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Default cancellation policy">
                  <Textarea rows={4} value={agency.default_cancellation_info} onChange={(e) => setAgency({ ...agency, default_cancellation_info: e.target.value })} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Default terms & conditions">
                  <Textarea rows={4} value={agency.default_terms_conditions} onChange={(e) => setAgency({ ...agency, default_terms_conditions: e.target.value })} />
                </Field>
              </div>
            </div>
            <div className="mt-5">
              <Button
                onClick={() => {
                  const phone = agency.phone.trim()
                    ? parseValidPhoneNumber(agency.phone)
                    : null;
                  if (agency.phone.trim() && !phone) {
                    toast.error("Enter a valid agency phone number for the selected country.");
                    return;
                  }
                  saveSetting.mutate({
                    key: "agency",
                    value: { ...agency, phone: phone ?? "" },
                  });
                }}
                disabled={saveSetting.isPending}
              >
                <Save className="size-4" /> Save agency profile
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pricing" className="mt-4">
          <Card className="max-w-3xl p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default markup %">
                <Input
                  type="number"
                  value={pricing.default_markup_pct}
                  onChange={(e) => setPricing({ ...pricing, default_markup_pct: e.target.value })}
                />
              </Field>
              <Field label="Default service charge (₹)">
                <Input
                  type="number"
                  value={pricing.service_charge}
                  onChange={(e) => setPricing({ ...pricing, service_charge: e.target.value })}
                />
              </Field>
              <Field label="GST % — domestic package">
                <Input
                  type="number"
                  value={pricing.gst_domestic_pct}
                  onChange={(e) => setPricing({ ...pricing, gst_domestic_pct: e.target.value })}
                />
              </Field>
              <Field label="GST % — international package">
                <Input
                  type="number"
                  value={pricing.gst_international_pct}
                  onChange={(e) =>
                    setPricing({ ...pricing, gst_international_pct: e.target.value })
                  }
                />
              </Field>
              <Field label="Quotation validity (days)">
                <Input
                  type="number"
                  value={pricing.quotation_validity_days}
                  onChange={(e) =>
                    setPricing({ ...pricing, quotation_validity_days: e.target.value })
                  }
                />
              </Field>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              GST on tour packages is charged at 5% without ITC. Update only if your CA advises a
              different slab.
            </p>
            <div className="mt-5">
              <Button
                disabled={saveSetting.isPending}
                onClick={() =>
                  saveSetting.mutate({
                    key: "pricing",
                    value: Object.fromEntries(
                      Object.entries(pricing).map(([k, v]) => [k, Number(v) || 0]),
                    ),
                  })
                }
              >
                <Save className="size-4" /> Save pricing defaults
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <div className="mb-4 flex justify-end">
            <TemplateDialog
              onSave={(values) => upsertTemplate.mutate({ values })}
              pending={upsertTemplate.isPending}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(templates.data ?? []).map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{t.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{titleize(t.channel)}</Badge>
                    {!t.is_active && <Badge variant="outline">inactive</Badge>}
                  </div>
                </div>
                {t.category && (
                  <p className="mt-1 text-xs text-muted-foreground">{titleize(t.category)}</p>
                )}
                <p className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">{t.body}</p>
              </Card>
            ))}
            {templates.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No templates yet. Add WhatsApp and email templates for enquiry follow-ups,
                quotation sharing and payment reminders.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="automations" className="mt-4">
          <AutomationsTab />
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <Card className="divide-y divide-border">
            {(profiles.data ?? []).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                </div>
                <Badge variant="secondary">{p.job_title || "Staff"}</Badge>
              </div>
            ))}
            {profiles.data?.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No staff profiles yet.</p>
            )}
          </Card>
          <p className="mt-3 text-xs text-muted-foreground">
            Roles are managed server-side. Ask an admin to grant module access for new staff.
          </p>
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-4">
          <WhatsAppConnectionsSettings />
          <Card className="mt-4 max-w-3xl space-y-4 p-5">
            <div>
              <h2 className="font-semibold">WhatsApp enquiry assignment</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Used when a customer asks for an agent before selecting a destination.
                Destination-selected enquiries continue to use that destination&apos;s assignment.
              </p>
            </div>
            <Field label="Default employee for WhatsApp agent handoffs">
              <Select
                value={wacrmFallbackAssigneeId || WACRM_UNASSIGNED}
                onValueChange={(value) =>
                  setWacrmFallbackAssigneeId(value === WACRM_UNASSIGNED ? "" : value)
                }
                disabled={!canAssign}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WACRM_UNASSIGNED}>Unassigned</SelectItem>
                  {(profiles.data ?? []).map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              disabled={!canAssign || saveSetting.isPending}
              onClick={() =>
                saveSetting.mutate({
                  key: "wacrm_integration",
                  value: {
                    default_assignee_id: wacrmFallbackAssigneeId || null,
                  },
                })
              }
            >
              Save assignment
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function TemplateDialog({
  onSave,
  pending,
}: {
  onSave: (values: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<string>("whatsapp");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Template name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Channel">
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
            </Field>
            <Field label="Category">
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="follow_up"
              />
            </Field>
          </div>
          <Field label="Message body">
            <Textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{customer_name}}, sharing your {{destination}} itinerary..."
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !name.trim() || !body.trim()}
            onClick={() => {
              onSave({
                name: name.trim(),
                channel,
                category: category.trim() || null,
                body: body.trim(),
                is_active: true,
              });
              setOpen(false);
              setName("");
              setCategory("");
              setBody("");
            }}
          >
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TRIGGERS = [
  { value: "lead_created", label: "New lead captured" },
  { value: "lead_no_response", label: "Lead has no response" },
  { value: "quotation_sent", label: "Quotation sent" },
  { value: "booking_confirmed", label: "Booking confirmed" },
  { value: "payment_due", label: "Payment deadline approaching" },
  { value: "travel_upcoming", label: "Travel date approaching" },
  { value: "document_expiring", label: "Passport / visa expiring" },
] as const;

const ACTIONS = [
  { value: "create_task", label: "Create a follow-up task" },
  { value: "notify_staff", label: "Notify assigned staff" },
  { value: "send_whatsapp", label: "Queue WhatsApp message" },
  { value: "send_email", label: "Queue email" },
] as const;

function AutomationsTab() {
  const rules = useAutomationRules();
  const upsert = useUpsertAutomationRule();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<string>("lead_created");
  const [action, setAction] = useState<string>("create_task");
  const [delayDays, setDelayDays] = useState("1");
  const [message, setMessage] = useState("");
  const [flowInput, setFlowInput] = useState("Hi");
  const [flow, setFlow] = useState(() => createTravelFlow({ name: "Travel enquiry flow", active: true }));

  const simulateFlow = (nextMessage: string) => {
    setFlow((current) => {
      const result = evaluateTravelFlowMessage(current.state, nextMessage);
      return {
        ...current,
        state: result.state,
      };
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Travel flow builder</p>
            <p className="text-xs text-muted-foreground">Local deterministic flow for WhatsApp lead capture.</p>
          </div>
          <Badge variant="secondary">MOCK / LOCAL</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {flow.steps.map((step) => (
            <div key={step.id} className="rounded-md border border-dashed bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{step.label}</p>
                <Badge variant={flow.state.currentStep === step.id ? "default" : "outline"}>
                  {flow.state.currentStep === step.id ? "Current" : step.type}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <Input value={flowInput} onChange={(e) => setFlowInput(e.target.value)} placeholder="Type a test message" />
          <Button onClick={() => {
            simulateFlow(flowInput);
            setFlowInput("");
          }}>
            Test flow
          </Button>
        </div>
        <div className="mt-4 rounded-md border bg-background p-3 text-sm whitespace-pre-wrap text-muted-foreground">
          {evaluateTravelFlowMessage(flow.state, flowInput || "").reply || "No message yet."}
        </div>
      </Card>

      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> New automation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New automation rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Rule name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="When this happens">
                <Select value={trigger} onValueChange={setTrigger}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Do this">
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Delay (days)">
                <Input
                  type="number"
                  value={delayDays}
                  onChange={(e) => setDelayDays(e.target.value)}
                />
              </Field>
              <Field label="Message / task title">
                <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
              </Field>
            </div>
            <DialogFooter>
              <Button
                disabled={upsert.isPending || !name.trim()}
                onClick={() => {
                  upsert.mutate({
                    values: {
                      name: name.trim(),
                      trigger_event: trigger,
                      action_type: action,
                      config: { delay_days: Number(delayDays) || 0, message: message.trim() },
                      is_active: true,
                    },
                  });
                  setOpen(false);
                  setName("");
                  setMessage("");
                }}
              >
                Save automation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="divide-y divide-border">
        {(rules.data ?? []).map((r) => {
          const config = (r.config ?? {}) as { delay_days?: number; message?: string };
          return (
            <div key={r.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {TRIGGERS.find((t) => t.value === r.trigger_event)?.label ??
                    titleize(r.trigger_event)}{" "}
                  → {ACTIONS.find((a) => a.value === r.action_type)?.label ??
                    titleize(r.action_type)}
                  {config.delay_days ? ` · after ${config.delay_days} day(s)` : ""}
                </p>
                {config.message && (
                  <p className="mt-1 text-sm text-muted-foreground">{config.message}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => upsert.mutate({ id: r.id, values: { is_active: !r.is_active } })}
              >
                {r.is_active ? "Pause" : "Activate"}
              </Button>
              <Badge variant={r.is_active ? "secondary" : "outline"}>
                {r.is_active ? "Active" : "Paused"}
              </Badge>
            </div>
          );
        })}
        {rules.data?.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            No automations yet. Add rules for follow-up reminders, payment nudges and document
            expiry alerts.
          </p>
        )}
      </Card>
    </div>
  );
}
