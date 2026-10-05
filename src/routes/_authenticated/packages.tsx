import { useState } from "react";
import { DestinationInput, useDestinationResolver } from "@/components/destination-input";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Package as PackageIcon } from "lucide-react";
import { usePackages, useUpsertPackage } from "@/lib/data";
import { CURRENCIES, HOTEL_CATEGORIES, formatMoney, titleize } from "@/lib/crm";
import { convertToInr, type CurrencyCode } from "@/lib/currency-converter";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export const Route = createFileRoute("/_authenticated/packages")({
  head: () => ({
    meta: [
      { title: "Package Library — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Ready-made domestic and international tour packages with nights, inclusions, hotel category and starting price per person.",
      },
      { property: "og:title", content: "Package Library — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Reusable tour packages your sales team can quote from in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PackagesPage,
});

function PackagesPage() {
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const packages = usePackages({ scope, search });

  return (
    <div>
      <PageHeader
        title="Package Library"
        subtitle="Reusable itineraries and pricing your team can quote from instantly."
        actions={<PackageDialog />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="w-56"
          placeholder="Search packages"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="domestic">Domestic</SelectItem>
            <SelectItem value="international">International</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(packages.data ?? []).map((p) => (
          <Card key={p.id} className="flex flex-col overflow-hidden p-0">
            {p.image_url ? (
              <img
                src={p.image_url}
                alt={`${p.name} tour package`}
                loading="lazy"
                className="h-36 w-full object-cover"
              />
            ) : (
              <div className="grid h-36 w-full place-items-center bg-muted text-muted-foreground">
                <PackageIcon className="size-8" />
              </div>
            )}
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.destinations?.name ?? "Multi-city"} · {p.nights}N/{p.days}D
                  </p>
                </div>
                <Badge variant="secondary">{titleize(p.scope)}</Badge>
              </div>
              {p.description && (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1">
                {(p.highlights ?? []).slice(0, 3).map((h: string) => (
                  <Badge key={h} variant="outline" className="text-[11px]">
                    {h}
                  </Badge>
                ))}
              </div>
              <div className="mt-auto flex items-end justify-between pt-4">
                <div>
                  <p className="text-[11px] text-muted-foreground">From / person</p>
                  <p className="font-display text-lg font-semibold">
                    {formatMoney(Number(p.starting_price), p.currency)}
                  </p>
                </div>
                {p.hotel_category && <Badge variant="outline">{p.hotel_category}</Badge>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {packages.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No packages match this filter.</p>
      )}
    </div>
  );
}

function PackageDialog() {
  const [open, setOpen] = useState(false);
  const resolveDestination = useDestinationResolver();
  const upsert = useUpsertPackage();
  const { rates } = useCurrencyRates();
  const [form, setForm] = useState({
    name: "",
    destination_name: "",
    scope: "domestic",
    nights: "4",
    days: "5",
    starting_price: "",
    currency: "INR",
    hotel_category: "3 Star",
    season: "",
    description: "",
    highlights: "",
    inclusions: "",
    exclusions: "",
  });

  const list = (v: string) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New package
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New tour package</DialogTitle>
          <DialogDescription>
            Define nights, price and inclusions once and reuse it across quotations.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Package name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Destination</Label>
            <DestinationInput
              value={form.destination_name}
              onChange={(v) => setForm({ ...form, destination_name: v })}
              scope={form.scope}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domestic">Domestic</SelectItem>
                <SelectItem value="international">International</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nights</Label>
            <Input
              type="number"
              value={form.nights}
              onChange={(e) => setForm({ ...form, nights: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Days</Label>
            <Input
              type="number"
              value={form.days}
              onChange={(e) => setForm({ ...form, days: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Starting price / person ({form.currency})</Label>
            <Input
              type="number"
              value={form.starting_price}
              onChange={(e) => setForm({ ...form, starting_price: e.target.value })}
            />
            <InrEquivalent amount={form.starting_price} currency={form.currency} />
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(currency) => setForm({ ...form, currency })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Hotel category</Label>
            <Select
              value={form.hotel_category}
              onValueChange={(v) => setForm({ ...form, hotel_category: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOTEL_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Season</Label>
            <Input
              value={form.season}
              onChange={(e) => setForm({ ...form, season: e.target.value })}
              placeholder="Oct - Mar"
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Highlights (comma separated)</Label>
            <Input
              value={form.highlights}
              onChange={(e) => setForm({ ...form, highlights: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Inclusions (comma separated)</Label>
            <Textarea
              rows={2}
              value={form.inclusions}
              onChange={(e) => setForm({ ...form, inclusions: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Exclusions (comma separated)</Label>
            <Textarea
              rows={2}
              value={form.exclusions}
              onChange={(e) => setForm({ ...form, exclusions: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={upsert.isPending || !form.name.trim() || !form.starting_price}
            onClick={async () => {
              const startingPrice = Number(form.starting_price) || 0;
              const startingPriceInr = convertToInr(startingPrice, form.currency as CurrencyCode, rates?.rates);
              if (startingPriceInr === null) {
                toast.error("Live exchange rates are required to save this package with its INR equivalent. Please try again.");
                return;
              }
              const destinationId = await resolveDestination(form.destination_name, form.scope);
              upsert.mutate({
                values: {
                  name: form.name.trim(),
                  destination_id: destinationId,
                  scope: form.scope,
                  nights: Number(form.nights) || 0,
                  days: Number(form.days) || 0,
                  starting_price: startingPrice,
                  starting_price_inr: startingPriceInr,
                  currency: form.currency,
                  exchange_rate: startingPrice > 0 ? startingPriceInr / startingPrice : 1,
                  exchange_rate_updated_at: rates?.updatedAt ?? null,
                  hotel_category: form.hotel_category,
                  season: form.season.trim() || null,
                  description: form.description.trim() || null,
                  highlights: list(form.highlights),
                  inclusions: list(form.inclusions),
                  exclusions: list(form.exclusions),
                  is_active: true,
                },
              });
              setOpen(false);
            }}
          >
            Save package
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
