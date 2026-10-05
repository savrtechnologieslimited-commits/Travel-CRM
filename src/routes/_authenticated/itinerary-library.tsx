import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useDestinations, useItineraries, useCreateItinerary, useUpdateItinerary, useCustomers } from "@/lib/data";
import { CURRENCIES, HOTEL_CATEGORIES, TRIP_TYPES, titleize } from "@/lib/crm";
import { convertToInr, type CurrencyCode } from "@/lib/currency-converter";
import { validateItineraryInput } from "@/lib/itinerary-library";
import { supabase } from "@/integrations/supabase/client";
import type { ItineraryListRow } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/itinerary-library")({
  head: () => ({
    meta: [
      { title: "Itinerary Library — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Saved travel itineraries organized by destination and duration.",
      },
      { property: "og:title", content: "Itinerary Library — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Saved travel itineraries organized by destination and duration.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ItineraryLibraryPage,
});

function ItineraryLibraryPage() {
  const [search, setSearch] = useState("");
  const [destinationId, setDestinationId] = useState("all");
  const { data: destinations = [] } = useDestinations();
  const destinationById = useMemo(
    () => new Map(destinations.map((destination) => [destination.id, destination])),
    [destinations],
  );
  const filters = {
    ...(search ? { search } : {}),
    ...(destinationId !== "all" ? { destinationId } : {}),
  } as { search?: string; destinationId?: string };
  const { data: itineraries = [], isLoading } = useItineraries(filters);

  return (
    <div>
      <PageHeader
        title="Itinerary Library"
        subtitle="Saved itineraries with their destination and duration."
        actions={<ItineraryDialog />}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="w-full sm:w-64"
          placeholder="Search itinerary"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={destinationId} onValueChange={setDestinationId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All destinations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All destinations</SelectItem>
            {destinations.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Itinerary</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Loading itinerary library…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && itineraries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No itineraries found. Save an itinerary from the builder to add its full content to this library.
                </TableCell>
              </TableRow>
            )}
            {itineraries.map((itinerary) => (
              <TableRow key={itinerary.id}>
                <TableCell>
                  <p className="font-medium">{itinerary.name}</p>
                  <p className="text-xs text-muted-foreground">{itinerary.description ?? "No summary"}</p>
                </TableCell>
                <TableCell>
                  {(itinerary.destination_id ? destinationById.get(itinerary.destination_id)?.name : null) ?? "—"}
                </TableCell>
                <TableCell>
                  {itinerary.duration_nights ?? 0}N / {itinerary.duration_days ?? 0}D
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <Button type="button" variant="outline" size="sm" className="w-fit" asChild>
                      <a href={`/itinerary-builder?libraryCopyFrom=${encodeURIComponent(itinerary.id)}`}><Pencil className="mr-1.5 size-3.5" />Edit as Copy</a>
                    </Button>
                    <ItineraryActions itinerary={itinerary} />
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

function ItineraryActions({ itinerary }: { itinerary: ItineraryListRow }) {
  const queryClient = useQueryClient();
  const { data: customers = [] } = useCustomers();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  async function deleteItinerary() {
    if (!window.confirm(`Delete "${itinerary.name}" and all of its saved itinerary content? This cannot be undone.`)) return;

    try {
      const { data: current, error: readError } = await supabase
        .from("itineraries")
        .select("document_path")
        .eq("id", itinerary.id)
        .maybeSingle();
      if (readError) throw readError;

      if (current?.document_path) {
        const { error: storageError } = await supabase.storage.from("itineraries").remove([current.document_path]);
        if (storageError) throw storageError;
      }

      const { error } = await supabase.from("itineraries").delete().eq("id", itinerary.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["itineraries"] });
      toast.success("Itinerary deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete itinerary");
    }
  }

  function assignToCustomer() {
    if (!selectedCustomerId) {
      toast.error("Select a customer first.");
      return;
    }
    window.location.assign(
      `/itinerary-builder?copyFrom=${encodeURIComponent(itinerary.id)}&customerId=${encodeURIComponent(selectedCustomerId)}`,
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedCustomerId("")}>
            <UserPlus className="mr-1.5 size-3.5" /> Assign to Customer
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign itinerary to customer</DialogTitle>
            <DialogDescription>
              Choose a customer to open a separate itinerary copy for review.
            </DialogDescription>
          </DialogHeader>
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={assignToCustomer} disabled={!selectedCustomerId}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => void deleteItinerary()}>
        <Trash2 className="mr-1.5 size-3.5" /> Delete
      </Button>
    </div>
  );
}

function ItineraryDialog() {
  const { data: destinations = [] } = useDestinations();
  const create = useCreateItinerary();
  const update = useUpdateItinerary();
  const { rates } = useCurrencyRates();
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    destination_id: "",
    duration_nights: "4",
    duration_days: "5",
    price: "",
    currency: "INR",
    hotel_category: "4 Star",
    trip_type: "family",
    description: "",
    valid_from: "",
    valid_until: "",
  });

  function reset() {
    setForm({
      name: "",
      destination_id: "",
      duration_nights: "4",
      duration_days: "5",
      price: "",
      currency: "INR",
      hotel_category: "4 Star",
      trip_type: "family",
      description: "",
      valid_from: "",
      valid_until: "",
    });
    setIsEditing(false);
    setEditingId(null);
  }

  async function submit() {
    const priceInr = form.price ? convertToInr(Number(form.price), form.currency as CurrencyCode, rates?.rates) : null;
    if (form.price && priceInr === null) {
      toast.error("Live exchange rates are required to save this itinerary price with its INR equivalent. Please try again.");
      return;
    }
    const validation = validateItineraryInput({
      ...form,
      destination_id: form.destination_id || null,
      duration_nights: Number(form.duration_nights),
      duration_days: Number(form.duration_days),
      price: form.price ? Number(form.price) : null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
    });

    if (!validation.valid) {
      toast.error(Object.values(validation.errors)[0]);
      return;
    }

    const payload = {
      name: form.name.trim(),
      destination_id: form.destination_id || null,
      duration_nights: Number(form.duration_nights),
      duration_days: Number(form.duration_days),
      price: form.price ? Number(form.price) : null,
      price_inr: priceInr,
      exchange_rate: form.price && priceInr !== null && Number(form.price) > 0 ? priceInr / Number(form.price) : 1,
      exchange_rate_updated_at: rates?.updatedAt ?? null,
      currency: form.currency || "INR",
      hotel_category: form.hotel_category || null,
      trip_type: form.trip_type || null,
      description: form.description.trim() || null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
    };

    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, values: payload });
      } else {
        await create.mutateAsync(payload);
      }

      toast.success(editingId ? "Itinerary updated" : "Itinerary created");
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save itinerary");
    }
  }

  const formDisabled = create.isPending || update.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Add Itinerary
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit itinerary" : "Add itinerary"}</DialogTitle>
          <DialogDescription>
            Save an itinerary package to the library.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Itinerary name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Destination</Label>
            <Select value={form.destination_id} onValueChange={(value) => setForm({ ...form, destination_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Choose destination" />
              </SelectTrigger>
              <SelectContent>
                {destinations.map((destination) => (
                  <SelectItem key={destination.id} value={destination.id}>
                    {destination.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(value) => setForm({ ...form, currency: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Duration nights</Label>
            <Input
              type="number"
              min={0}
              value={form.duration_nights}
              onChange={(e) => setForm({ ...form, duration_nights: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Duration days</Label>
            <Input
              type="number"
              min={0}
              value={form.duration_days}
              onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Price ({form.currency})</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
            <InrEquivalent amount={form.price} currency={form.currency} />
          </div>
          <div className="space-y-1.5">
            <Label>Hotel category</Label>
            <Select value={form.hotel_category} onValueChange={(value) => setForm({ ...form, hotel_category: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Hotel category" />
              </SelectTrigger>
              <SelectContent>
                {HOTEL_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Trip type</Label>
            <Select value={form.trip_type} onValueChange={(value) => setForm({ ...form, trip_type: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Trip type" />
              </SelectTrigger>
              <SelectContent>
                {TRIP_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {titleize(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valid from</Label>
            <Input
              type="date"
              value={form.valid_from}
              onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Valid until</Label>
            <Input
              type="date"
              value={form.valid_until}
              onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={formDisabled}>
            {formDisabled ? "Saving…" : isEditing ? "Update itinerary" : "Save itinerary"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
