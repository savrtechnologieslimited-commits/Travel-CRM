import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Save } from "lucide-react";
import { useAppSettings, useSaveAppSetting } from "@/lib/data";
import { DEFAULT_ITINERARY_TERMS } from "@/lib/itinerary-terms-extractor";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { parseValidPhoneNumber } from "@/lib/phone-number";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SAVR Travels CRM" },
      {
        name: "description",
        content: "Configure agency profile, GST and markup defaults.",
      },
      { property: "og:title", content: "Settings — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Agency profile, GST and markup defaults.",
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
  website: string;
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
  service_charge: string;
  quotation_validity_days: string;
};

function SettingsPage() {
  const settings = useAppSettings();
  const saveSetting = useSaveAppSetting();

  const agencyValue = settings.data?.find((s) => s.key === "agency")?.value as
    Partial<AgencyForm> | undefined;
  const pricingValue = settings.data?.find((s) => s.key === "pricing")?.value as
    Partial<Record<keyof PricingForm, number | string>> | undefined;

  const [agency, setAgency] = useState<AgencyForm>({
    name: "SAVR Travels",
    gstin: "",
    phone: "",
    email: "",
    website: "",
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
    service_charge: "0",
    quotation_validity_days: "7",
  });
  useEffect(() => {
    if (agencyValue)
      setAgency((p) => ({
        ...p,
        ...(agencyValue as Partial<AgencyForm>),
        default_terms_conditions:
          agencyValue.default_terms_conditions ?? agencyValue.terms ?? p.default_terms_conditions,
      }));
  }, [settings.dataUpdatedAt]);

  useEffect(() => {
    if (pricingValue) {
      setPricing((p) => ({
        ...p,
        default_markup_pct: String(pricingValue.default_markup_pct ?? p.default_markup_pct),
        gst_domestic_pct: String(pricingValue.gst_domestic_pct ?? p.gst_domestic_pct),
        service_charge: String(pricingValue.service_charge ?? p.service_charge),
        quotation_validity_days: String(
          pricingValue.quotation_validity_days ?? p.quotation_validity_days,
        ),
      }));
    }
  }, [settings.dataUpdatedAt]);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Agency profile and pricing defaults." />

      <Tabs defaultValue="agency">
        <TabsList>
          <TabsTrigger value="agency">Agency</TabsTrigger>
          <TabsTrigger value="pricing">Pricing & Tax</TabsTrigger>
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
              <Field label="Agency Website">
                <Input
                  type="url"
                  value={agency.website}
                  onChange={(e) => setAgency({ ...agency, website: e.target.value })}
                  placeholder="https://example.com"
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
                <p className="mt-1 text-xs text-muted-foreground">
                  These are prefilled on new itineraries. Terms found in an uploaded supplier PDF
                  replace the matching defaults.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Field label="Default inclusions">
                  <Textarea
                    rows={4}
                    value={agency.default_inclusions}
                    onChange={(e) => setAgency({ ...agency, default_inclusions: e.target.value })}
                    placeholder="One inclusion per line"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Default exclusions">
                  <Textarea
                    rows={3}
                    value={agency.default_exclusions}
                    onChange={(e) => setAgency({ ...agency, default_exclusions: e.target.value })}
                    placeholder="One exclusion per line"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Default cancellation policy">
                  <Textarea
                    rows={4}
                    value={agency.default_cancellation_info}
                    onChange={(e) =>
                      setAgency({ ...agency, default_cancellation_info: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Default terms & conditions">
                  <Textarea
                    rows={4}
                    value={agency.default_terms_conditions}
                    onChange={(e) =>
                      setAgency({ ...agency, default_terms_conditions: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
            <div className="mt-5">
              <Button
                onClick={() => {
                  const phone = agency.phone.trim() ? parseValidPhoneNumber(agency.phone) : null;
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
              <Field label="GST %">
                <Input
                  type="number"
                  value={pricing.gst_domestic_pct}
                  onChange={(e) => setPricing({ ...pricing, gst_domestic_pct: e.target.value })}
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
                    value: {
                      default_markup_pct: Number(pricing.default_markup_pct) || 0,
                      gst_domestic_pct: Number(pricing.gst_domestic_pct) || 0,
                      service_charge: Number(pricing.service_charge) || 0,
                      quotation_validity_days: Number(pricing.quotation_validity_days) || 0,
                    },
                  })
                }
              >
                <Save className="size-4" /> Save pricing defaults
              </Button>
            </div>
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
