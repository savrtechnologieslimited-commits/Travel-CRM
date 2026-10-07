import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Mail, MessageSquareText, PencilLine, Phone, Plus, Search } from "lucide-react";
import { useCustomers } from "@/lib/data";
import { formatDate } from "@/lib/crm";
import { NewCustomerDialog } from "@/components/entity-dialogs";
import { WacrmContactMatchLink } from "@/components/wacrm-contact-match-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — SAVR Travels CRM" },
      {
        name: "description",
        content: "Traveller profiles and trip history for the agency.",
      },
      { property: "og:title", content: "Customers — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Traveller profiles and travel history in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomersPage,
});

export function formatCustomerLocation(customer: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}) {
  return [customer.city, customer.state, customer.country].filter(Boolean).join(", ") || "—";
}

export function formatCustomerPrimaryContact(customer: {
  mobile?: string | null;
  whatsapp?: string | null;
}) {
  return customer.whatsapp?.trim() || customer.mobile?.trim() || "—";
}

export function formatCustomerSummary(customer: {
  full_name?: string | null;
  code?: string | null;
}) {
  return customer.full_name ?? customer.code ?? "Customer";
}

function CustomersPage() {
  const [search, setSearch] = useState("");
  const { data: customers = [], isLoading } = useCustomers(search);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Customers
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your travel clients and their trip history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Filter/Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full min-w-[200px] pl-9 text-sm"
            />
          </div>
          <NewCustomerDialog
            trigger={
              <Button size="sm" className="h-9 bg-slate-900 text-white hover:bg-slate-800">
                <Plus className="size-4" />
                Add Customer
              </Button>
            }
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[840px]">
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="h-9 text-[11px] uppercase tracking-[0.12em]">
                  Customer
                </TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-[0.12em]">
                  Phone / WhatsApp
                </TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-[0.12em]">Email</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-[0.12em]">
                  Location
                </TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-[0.12em]">
                  Created
                </TableHead>
                <TableHead className="h-9 text-right text-[11px] uppercase tracking-[0.12em]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    Loading customers…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    No customers yet.
                  </TableCell>
                </TableRow>
              )}
              {customers.map((customer) => {
                const phone = formatCustomerPrimaryContact(customer);
                return (
                  <TableRow key={customer.id} className="align-middle hover:bg-slate-50/80">
                    <TableCell className="py-2.5">
                      <Link
                        to="/customers/$customerId"
                        params={{ customerId: customer.id }}
                        className="block font-medium text-slate-900 hover:text-slate-700 hover:underline"
                      >
                        {formatCustomerSummary(customer)}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">{customer.code ?? "Customer"}</p>
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-slate-700">{phone}</TableCell>
                    <TableCell className="py-2.5 text-sm text-slate-700">
                      {customer.email ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-slate-700">
                      {formatCustomerLocation(customer)}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-slate-700">
                      {customer.created_at ? formatDate(customer.created_at) : "—"}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-600 hover:text-sky-700"
                          asChild
                        >
                          <Link
                            to="/customers/$customerId"
                            params={{ customerId: customer.id }}
                            title="View customer"
                            aria-label="View customer"
                          >
                            <Eye className="size-4" />
                          </Link>
                        </Button>

                        <NewCustomerDialog
                          record={customer}
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-600 hover:text-sky-700"
                              title="Edit customer"
                              aria-label="Edit customer"
                            >
                              <PencilLine className="size-4" />
                            </Button>
                          }
                        />

                        {phone !== "—" ? (
                          <a
                            href={`tel:${phone}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            title={`Call ${customer.full_name}`}
                            aria-label={`Call ${customer.full_name}`}
                          >
                            <Phone className="size-4" />
                          </a>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 cursor-not-allowed rounded-md text-slate-300"
                            title="No phone number available"
                            aria-label="No phone number available"
                            disabled
                          >
                            <Phone className="size-4" />
                          </Button>
                        )}

                        {customer.email ? (
                          <a
                            href={`mailto:${customer.email}?subject=${encodeURIComponent("Travel plans with SAVR Travels")}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            title={`Email ${customer.full_name}`}
                            aria-label={`Email ${customer.full_name}`}
                          >
                            <Mail className="size-4" />
                          </a>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 cursor-not-allowed rounded-md text-slate-300"
                            title="No email address available"
                            aria-label="No email address available"
                            disabled
                          >
                            <Mail className="size-4" />
                          </Button>
                        )}

                        <WacrmContactMatchLink
                          recordType="customer"
                          recordId={customer.id}
                          compact
                          disabled={phone === "—"}
                          trigger={<MessageSquareText className="size-4" />}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
