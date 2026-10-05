import { useState } from "react";
import { useSuppliers, useUpdateBookingItem } from "@/lib/data";
import { FULFILMENT_LABELS, FULFILMENT_MODES, fulfilmentLabel, titleize } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/**
 * Reusable fulfilment controls: mode (direct / through partner) plus the
 * partner selector. Only ACTIVE suppliers can be newly selected; a supplier
 * already attached to the line stays selectable so history is never rewritten.
 */
export function FulfilmentFields({
  mode,
  supplierId,
  onChange,
  currentSupplier,
}: {
  mode: string;
  supplierId: string;
  onChange: (next: { fulfilment_mode: string; supplier_id: string }) => void;
  /** Supplier row already linked to this line (may be inactive). */
  currentSupplier?: { id?: string | null; name?: string | null } | null;
}) {
  const { data: suppliers = [] } = useSuppliers();
  const options: Row[] = [...suppliers];
  if (supplierId && currentSupplier?.name && !options.some((s) => s.id === supplierId)) {
    options.unshift({ id: supplierId, name: `${currentSupplier.name} (inactive)` });
  }

  return (
    <>
      <div>
        <Label>Fulfilment</Label>
        <Select
          value={mode}
          onValueChange={(v) =>
            onChange({ fulfilment_mode: v, supplier_id: v === "direct" ? "" : supplierId })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FULFILMENT_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {FULFILMENT_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {mode === "supplier" && (
        <div>
          <Label>Fulfilment partner</Label>
          <Select
            value={supplierId}
            onValueChange={(v) => onChange({ fulfilment_mode: "supplier", supplier_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select partner (DMC, hotel, transport…)" />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.supplier_types?.[0] || s.category
                    ? ` · ${titleize(s.supplier_types?.[0] ?? s.category)}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}

/**
 * Booking-side fulfilment editor. Writes ONLY fulfilment_mode + supplier_id —
 * pricing (cost_price / sell_price) and all derived booking totals are untouched.
 */
export function BookingFulfilmentEditor({ item }: { item: Row }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateBookingItem();
  const linked = Array.isArray(item.suppliers) ? item.suppliers[0] : item.suppliers;
  const [form, setForm] = useState({
    fulfilment_mode: (item.fulfilment_mode as string) ?? "direct",
    supplier_id: (item.supplier_id as string) ?? "",
  });

  const invalid = form.fulfilment_mode === "supplier" && !form.supplier_id;

  async function save() {
    if (invalid) return;
    await update.mutateAsync({
      id: item.id as string,
      values: {
        fulfilment_mode: form.fulfilment_mode,
        supplier_id: form.fulfilment_mode === "supplier" ? form.supplier_id : null,
      },
    });
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o)
          setForm({
            fulfilment_mode: (item.fulfilment_mode as string) ?? "direct",
            supplier_id: (item.supplier_id as string) ?? "",
          });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto px-1 py-0 text-left">
          {fulfilmentLabel(item.fulfilment_mode, linked)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fulfilment — {item.title as string}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <FulfilmentFields
            mode={form.fulfilment_mode}
            supplierId={form.supplier_id}
            currentSupplier={linked ? { id: item.supplier_id, name: linked.name } : null}
            onChange={(next) => setForm(next)}
          />
          <p className="text-xs text-muted-foreground">
            Fulfilment only records who provides the service. Prices and booking totals stay
            unchanged.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={invalid || update.isPending}>
            Save fulfilment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
