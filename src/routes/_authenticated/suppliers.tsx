import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useSuppliersFull, useUpsertSupplier } from "@/lib/data";
import { SupplierEmailTemplateDialog } from "@/components/supplier-email-template-dialog";
import {
  CURRENCIES,
  SUPPLIER_CATEGORIES,
  SUPPLIER_TYPES,
  formatMoney,
  supplierTypeLabel,
  titleize,
} from "@/lib/crm";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { parseValidPhoneNumber } from "@/lib/phone-number";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Hotels, DMCs, airlines, transport and visa partners with contacts, payment terms and credit limits.",
      },
      { property: "og:title", content: "Suppliers — SAVR Travels CRM" },
      {
        property: "og:description",
        content:
          "Supplier directory with GSTIN, payment terms and credit limits for travel operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const [search, setSearch] = useState("");
  const { data: suppliers = [], isLoading } = useSuppliersFull(search);

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Hotels, DMCs, airlines, transport and visa partners."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SupplierEmailTemplateDialog />
            <NewSupplierDialog />
          </div>
        }
      />

      <Input
        className="mb-4 max-w-sm"
        placeholder="Search suppliers…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Partner types</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Destination / region</TableHead>
              <TableHead>Payment terms</TableHead>
              <TableHead className="text-right">Credit limit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Loading suppliers…</TableCell>
              </TableRow>
            )}
            {!isLoading && suppliers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>No suppliers found.</TableCell>
              </TableRow>
            )}
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[s.legal_name, s.gstin ? `GSTIN ${s.gstin}` : null]
                      .filter(Boolean)
                      .join(" · ") || "No GSTIN"}
                  </p>
                </TableCell>
                <TableCell className="space-x-1">
                  {(s.supplier_types?.length ? s.supplier_types : [s.category]).map((t: string) => (
                    <Badge key={t} variant="secondary">
                      {supplierTypeLabel(t)}
                    </Badge>
                  ))}
                  {!s.is_active && <Badge variant="outline">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-sm">
                  {s.contact_person ?? "—"}
                  <span className="block text-xs text-muted-foreground">
                    {s.phone ?? s.email ?? ""}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {[s.region, s.city, s.country].filter(Boolean).join(", ") || "—"}
                </TableCell>
                <TableCell className="text-sm">{s.payment_terms ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {s.credit_limit ? formatMoney(s.credit_limit) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function NewSupplierDialog() {
  const [open, setOpen] = useState(false);
  const upsert = useUpsertSupplier();
  const [types, setTypes] = useState<string[]>(["hotel"]);
  const [active, setActive] = useState(true);
  const [form, setForm] = useState({
    name: "",
    legal_name: "",
    category: "hotel",
    region: "",
    currency: "INR",
    contact_person: "",
    phone: "",
    email: "",
    city: "",
    country: "India",
    gstin: "",
    payment_terms: "",
    credit_limit: "",
    notes: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = form.phone.trim() ? parseValidPhoneNumber(form.phone) : null;
    if (form.phone.trim() && !phone) {
      toast.error("Enter a valid supplier phone number for the selected country.");
      return;
    }
    await upsert.mutateAsync({
      values: {
        name: form.name,
        legal_name: form.legal_name || null,
        category: types[0] ?? form.category,
        supplier_types: types.length ? types : [form.category],
        region: form.region || null,
        currency: form.currency,
        contact_person: form.contact_person || null,
        phone,
        email: form.email || null,
        city: form.city || null,
        country: form.country || null,
        gstin: form.gstin || null,
        payment_terms: form.payment_terms || null,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        notes: form.notes || null,
        is_active: active,
      },
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> New supplier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add supplier</DialogTitle>
          <DialogDescription>
            Store contact, GSTIN, payment terms and credit limit for costing and payouts.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="s-legal">Legal / company name</Label>
            <Input
              id="s-legal"
              value={form.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
              placeholder="Kerala Holidays Pvt Ltd"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Partner types</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SUPPLIER_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={types.includes(t)}
                    onCheckedChange={(checked) =>
                      setTypes((prev) => (checked ? [...prev, t] : prev.filter((x) => x !== t)))
                    }
                  />
                  {supplierTypeLabel(t)}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A partner can hold several capabilities, e.g. DMC and transport provider.
            </p>
          </div>
          <div>
            <Label htmlFor="s-region">Destination / region</Label>
            <Input
              id="s-region"
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
              placeholder="Kerala"
            />
          </div>
          <div>
            <Label>Billing currency</Label>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="s-contact">Contact person</Label>
            <Input
              id="s-contact"
              value={form.contact_person}
              onChange={(e) => set("contact_person", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="s-phone">Phone</Label>
            <PhoneNumberInput id="s-phone" value={form.phone} onChange={(value) => set("phone", value)} />
          </div>
          <div>
            <Label htmlFor="s-email">Email</Label>
            <Input
              id="s-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="s-city">City</Label>
            <Input id="s-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-country">Country</Label>
            <Input
              id="s-country"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="s-gstin">GSTIN</Label>
            <Input id="s-gstin" value={form.gstin} onChange={(e) => set("gstin", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-terms">Payment terms</Label>
            <Input
              id="s-terms"
              value={form.payment_terms}
              onChange={(e) => set("payment_terms", e.target.value)}
              placeholder="50% advance, balance on check-out"
            />
          </div>
          <div>
            <Label htmlFor="s-credit">Credit limit (₹)</Label>
            <Input
              id="s-credit"
              type="number"
              value={form.credit_limit}
              onChange={(e) => set("credit_limit", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="s-notes">Notes</Label>
            <Textarea
              id="s-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch id="s-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="s-active">Active — available for new bookings</Label>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save supplier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
