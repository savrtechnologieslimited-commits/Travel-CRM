import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, UserPlus } from "lucide-react";
import {
  useConvertEnquiryToCustomer,
  useConvertEnquiryToQuotation,
  useConvertLeadToCustomer,
  useConvertLeadToEnquiry,
  useConvertQuotationToBooking,
} from "@/lib/data";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Lead → customer / enquiry conversions. */
export function LeadConvertActions({
  leadId,
  hasCustomer,
}: {
  leadId: string;
  hasCustomer?: boolean;
}) {
  const navigate = useNavigate();
  const toCustomer = useConvertLeadToCustomer();
  const toEnquiry = useConvertLeadToEnquiry();
  const busy = toCustomer.isPending || toEnquiry.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {busy ? "Converting…" : "Convert"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Move this lead forward</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={async () => {
            const id = await toCustomer.mutateAsync(leadId);
            navigate({ to: "/customers/$customerId", params: { customerId: id } });
          }}
        >
          <UserPlus className="mr-2 size-4" />
          {hasCustomer ? "Open customer" : "Convert to customer"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            await toEnquiry.mutateAsync(leadId);
            navigate({ to: "/enquiries" });
          }}
        >
          <ArrowRight className="mr-2 size-4" />
          Convert to enquiry
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Enquiry → customer / quotation conversions. */
export function EnquiryConvertActions({
  enquiryId,
  hasCustomer,
}: {
  enquiryId: string;
  hasCustomer?: boolean;
}) {
  const navigate = useNavigate();
  const toCustomer = useConvertEnquiryToCustomer();
  const toQuotation = useConvertEnquiryToQuotation();
  const busy = toCustomer.isPending || toQuotation.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {busy ? "Converting…" : "Convert"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Move this enquiry forward</DropdownMenuLabel>
        {!hasCustomer && (
          <DropdownMenuItem
            onSelect={async () => {
              const id = await toCustomer.mutateAsync(enquiryId);
              navigate({ to: "/customers/$customerId", params: { customerId: id } });
            }}
          >
            <UserPlus className="mr-2 size-4" />
            Convert to customer
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={async () => {
            const id = await toQuotation.mutateAsync(enquiryId);
            navigate({ to: "/quotations/$quotationId", params: { quotationId: id } });
          }}
        >
          <ArrowRight className="mr-2 size-4" />
          Create quotation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Quotation → booking conversion. */
export function QuotationConvertButton({ quotationId }: { quotationId: string }) {
  const navigate = useNavigate();
  const convert = useConvertQuotationToBooking();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={convert.isPending}
      onClick={async () => {
        const id = await convert.mutateAsync(quotationId);
        navigate({ to: "/bookings/$bookingId", params: { bookingId: id } });
      }}
    >
      {convert.isPending ? "Converting…" : "To booking"}
    </Button>
  );
}
