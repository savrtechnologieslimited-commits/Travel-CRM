import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useBookings, useSuppliersFull } from "@/lib/data";
import {
  useAddExpense,
  useExpenses,
  usePaySupplierBill,
  useSupplierBills,
  useUpsertSupplierBill,
} from "@/lib/ops-data";
import { CURRENCIES, PAYMENT_METHODS, formatDate, formatMoney, titleize, today } from "@/lib/crm";
import { convertToInr, type CurrencyCode } from "@/lib/currency-converter";
import { InrEquivalent, useCurrencyRates } from "@/components/currency-converter";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const BILL_STATUSES = ["unpaid", "partially_paid", "paid", "disputed", "cancelled"];
const EXPENSE_CATEGORIES = [
  "salary",
  "rent",
  "marketing",
  "travel",
  "utilities",
  "software",
  "commission",
  "office",
  "other",
];

export const Route = createFileRoute("/_authenticated/payables")({
  head: () => ({
    meta: [
      { title: "Payables & Expenses — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Supplier bills, outstanding payables ageing and office expenses like salaries, rent and marketing.",
      },
      { property: "og:title", content: "Payables & Expenses — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Vendor bill tracking, payouts and internal expense records for the agency.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PayablesPage,
});

function PayablesPage() {
  return (
    <div>
      <PageHeader
        title="Payables & Expenses"
        subtitle="What we owe suppliers, and what the agency spends to run."
      />
      <Tabs defaultValue="bills">
        <TabsList className="mb-4">
          <TabsTrigger value="bills">Supplier bills</TabsTrigger>
          <TabsTrigger value="expenses">Office expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="bills">
          <BillsTab />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BillsTab() {
  const [status, setStatus] = useState("all");
  const { data: bills = [], isLoading } = useSupplierBills(status);

  const totals = useMemo(() => {
    const outstanding = bills.reduce(
      (s, b) => s + Math.max(0, Number(b.total_amount) - Number(b.amount_paid)),
      0,
    );
    const t = today();
    const overdue = bills
      .filter((b) => b.due_date && b.due_date < t && Number(b.amount_paid) < Number(b.total_amount))
      .reduce((s, b) => s + (Number(b.total_amount) - Number(b.amount_paid)), 0);
    const billed = bills.reduce((s, b) => s + Number(b.total_amount), 0);
    return { outstanding, overdue, billed };
  }, [bills]);

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total billed</p>
          <p className="font-display text-2xl font-semibold">{formatMoney(totals.billed)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Outstanding payable</p>
          <p className="font-display text-2xl font-semibold">{formatMoney(totals.outstanding)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Overdue</p>
          <p className="font-display text-2xl font-semibold text-destructive">
            {formatMoney(totals.overdue)}
          </p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {BILL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {titleize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <NewBillDialog />
      </div>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Bill</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9}>Loading bills…</TableCell>
              </TableRow>
            )}
            {!isLoading && bills.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>No supplier bills recorded yet.</TableCell>
              </TableRow>
            )}
            {bills.map((b) => {
              const balance = Number(b.total_amount) - Number(b.amount_paid);
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.suppliers?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {b.code ?? "—"}
                    <span className="block text-xs text-muted-foreground">
                      {b.bill_number ? `Supplier inv ${b.bill_number} · ` : ""}
                      {formatDate(b.bill_date)} · {titleize(b.service_type ?? "")}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{b.bookings?.code ?? "—"}</TableCell>
                  <TableCell className="text-sm">{formatDate(b.due_date)}</TableCell>
                  <TableCell className="text-right">{formatMoney(Number(b.total_amount), b.currency)}</TableCell>
                  <TableCell className="text-right">{formatMoney(Number(b.amount_paid), b.currency)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(balance, b.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={balance <= 0 ? "secondary" : "outline"}>{titleize(b.status)}</Badge>
                  </TableCell>
                  <TableCell>{balance > 0 && <PayDialog bill={b} balance={balance} />}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function NewBillDialog() {
  const [open, setOpen] = useState(false);
  const upsert = useUpsertSupplierBill();
  const { rates } = useCurrencyRates();
  const { data: suppliers = [] } = useSuppliersFull();
  const { data: bookings = [] } = useBookings();
  const [form, setForm] = useState({
    supplier_id: "",
    booking_id: "",
    bill_number: "",
    bill_date: today(),
    due_date: "",
    currency: "INR",
    amount: "0",
    tax_amount: "0",
    service_type: "",
    notes: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount || 0);
    const tax = Number(form.tax_amount || 0);
    const amountInr = amount ? convertToInr(amount, form.currency as CurrencyCode, rates?.rates) : 0;
    const taxAmountInr = tax ? convertToInr(tax, form.currency as CurrencyCode, rates?.rates) : 0;
    if (amountInr === null || taxAmountInr === null) {
      toast.error("Live exchange rates are required to save this bill with INR equivalents. Please try again.");
      return;
    }
    await upsert.mutateAsync({
      values: {
        supplier_id: form.supplier_id || null,
        booking_id: form.booking_id || null,
        bill_number: form.bill_number || null,
        bill_date: form.bill_date,
        due_date: form.due_date || null,
        currency: form.currency,
        amount,
        amount_inr: amountInr,
        tax_amount: tax,
        tax_amount_inr: taxAmountInr,
        total_amount: amount + tax,
        total_amount_inr: amountInr + taxAmountInr,
        amount_paid: 0,
        amount_paid_inr: 0,
        exchange_rate: amount > 0 ? amountInr / amount : tax > 0 ? taxAmountInr / tax : 1,
        exchange_rate_updated_at: rates?.updatedAt ?? null,
        status: "unpaid",
        service_type: form.service_type || null,
        notes: form.notes || null,
      },
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> New bill
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record supplier bill</DialogTitle>
          <DialogDescription>Vendor invoice against a booking, with tax and due date.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Supplier</Label>
            <Select value={form.supplier_id} onValueChange={(v) => set("supplier_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Booking</Label>
            <Select value={form.booking_id} onValueChange={(v) => set("booking_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Link booking" />
              </SelectTrigger>
              <SelectContent>
                {bookings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.code ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="b-num">Bill number</Label>
            <Input id="b-num" value={form.bill_number} onChange={(e) => set("bill_number", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="b-service">Service type</Label>
            <Input
              id="b-service"
              placeholder="Hotel, transport, visa…"
              value={form.service_type}
              onChange={(e) => set("service_type", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="b-date">Bill date</Label>
            <Input id="b-date" type="date" value={form.bill_date} onChange={(e) => set("bill_date", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="b-due">Due date</Label>
            <Input id="b-due" type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
          <div>
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="b-amt">Amount ({form.currency})</Label>
            <Input id="b-amt" type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            <InrEquivalent amount={form.amount} currency={form.currency} />
          </div>
          <div>
            <Label htmlFor="b-tax">Tax ({form.currency})</Label>
            <Input id="b-tax" type="number" value={form.tax_amount} onChange={(e) => set("tax_amount", e.target.value)} />
            <InrEquivalent amount={form.tax_amount} currency={form.currency} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="b-notes">Notes</Label>
            <Textarea id="b-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({
  bill,
  balance,
}: {
  bill: {
    id: string;
    supplier_id: string | null;
    booking_id: string | null;
    amount_paid: number;
    amount_paid_inr: number | null;
    total_amount: number;
    currency: string;
  };
  balance: number;
}) {
  const [open, setOpen] = useState(false);
  const pay = usePaySupplierBill();
  const { rates } = useCurrencyRates();
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payout = Number(amount || 0);
    const amountInr = payout ? convertToInr(payout, bill.currency as CurrencyCode, rates?.rates) : 0;
    if (amountInr === null) {
      toast.error("Live exchange rates are required to save this payout with its INR equivalent. Please try again.");
      return;
    }
    const existingPaidInr = bill.amount_paid_inr ?? convertToInr(Number(bill.amount_paid), bill.currency as CurrencyCode, rates?.rates);
    if (existingPaidInr === null) {
      toast.error("Live exchange rates are required to update this bill's INR balance. Please try again.");
      return;
    }
    await pay.mutateAsync({
      bill: {
        id: bill.id,
        supplier_id: bill.supplier_id,
        booking_id: bill.booking_id,
        amount_paid: Number(bill.amount_paid),
        amount_paid_inr: existingPaidInr,
        total_amount: Number(bill.total_amount),
        currency: bill.currency,
      },
      amount: payout,
      amount_inr: amountInr,
      exchange_rate: payout > 0 ? amountInr / payout : 1,
      exchange_rate_updated_at: rates?.updatedAt ?? null,
      method,
      reference,
      paid_on: paidOn,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Pay
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record supplier payout</DialogTitle>
          <DialogDescription>Balance due {formatMoney(balance, bill.currency)}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label htmlFor="p-amt">Amount ({bill.currency})</Label>
            <Input id="p-amt" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <InrEquivalent amount={amount} currency={bill.currency} />
          </div>
          <div>
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {titleize(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="p-ref">Reference</Label>
            <Input id="p-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-date">Paid on</Label>
            <Input id="p-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pay.isPending}>
              {pay.isPending ? "Saving…" : "Record payout"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpensesTab() {
  const [category, setCategory] = useState("all");
  const { data: expenses = [], isLoading } = useExpenses(category);
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount_inr ?? (expense.currency === "INR" ? expense.amount : 0)), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {titleize(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">Total {formatMoney(total)}</Badge>
        <div className="flex-1" />
        <NewExpenseDialog />
      </div>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Paid to</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Loading expenses…</TableCell>
              </TableRow>
            )}
            {!isLoading && expenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>No expenses recorded yet.</TableCell>
              </TableRow>
            )}
            {expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-sm">{formatDate(e.expense_date)}</TableCell>
                <TableCell>{titleize(e.category)}</TableCell>
                <TableCell className="text-sm">{e.description ?? "—"}</TableCell>
                <TableCell className="text-sm">{e.paid_to ?? "—"}</TableCell>
                <TableCell className="text-sm">{titleize(e.method)}</TableCell>
                <TableCell className="text-right font-medium">{formatMoney(Number(e.amount), e.currency)}{e.currency !== "INR" && e.amount_inr != null && <span className="block text-xs font-normal text-muted-foreground">{formatMoney(Number(e.amount_inr), "INR")}</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function NewExpenseDialog() {
  const [open, setOpen] = useState(false);
  const add = useAddExpense();
  const { rates } = useCurrencyRates();
  const [form, setForm] = useState({
    category: "office",
    description: "",
    amount: "0",
    currency: "INR",
    expense_date: today(),
    paid_to: "",
    method: "bank_transfer",
    reference: "",
    notes: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount || 0);
    const amountInr = convertToInr(amount, form.currency as CurrencyCode, rates?.rates);
    if (amountInr === null) {
      toast.error("Live exchange rates are required to save this expense with its INR equivalent. Please try again.");
      return;
    }
    await add.mutateAsync({
      category: form.category,
      description: form.description || null,
      amount,
      amount_inr: amountInr,
      currency: form.currency,
      exchange_rate: amount > 0 ? amountInr / amount : 1,
      exchange_rate_updated_at: rates?.updatedAt ?? null,
      expense_date: form.expense_date,
      paid_to: form.paid_to || null,
      method: form.method,
      reference: form.reference || null,
      notes: form.notes || null,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> New expense
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record expense</DialogTitle>
          <DialogDescription>Salaries, rent, marketing and other running costs.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {titleize(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(value) => set("currency", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="e-amt">Amount ({form.currency})</Label>
            <Input id="e-amt" type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            <InrEquivalent amount={form.amount} currency={form.currency} />
          </div>
          <div>
            <Label htmlFor="e-date">Date</Label>
            <Input
              id="e-date"
              type="date"
              value={form.expense_date}
              onChange={(e) => set("expense_date", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="e-paid">Paid to</Label>
            <Input id="e-paid" value={form.paid_to} onChange={(e) => set("paid_to", e.target.value)} />
          </div>
          <div>
            <Label>Method</Label>
            <Select value={form.method} onValueChange={(v) => set("method", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {titleize(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="e-ref">Reference</Label>
            <Input id="e-ref" value={form.reference} onChange={(e) => set("reference", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="e-desc">Description</Label>
            <Input id="e-desc" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Saving…" : "Record expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
