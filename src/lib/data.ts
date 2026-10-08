import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBusinessVisibleProfiles } from "./business-visible-users.data";
import { hasFullLeadVisibility } from "./lead-ownership";

/** Shared react-query helpers over the Cloud database (RLS scoped to signed-in staff). */

export function useDestinations() {
  return useQuery({
    queryKey: ["destinations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("destinations")
        .select("id,name,country,scope,region")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      return getBusinessVisibleProfiles();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeads(filters?: {
  status?: string;
  scope?: string;
  source?: string;
  search?: string;
  owner?: string;
  ownerId?: string | null;
}) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Could not identify the signed-in user.");

      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id);
      if (roleError) throw roleError;

      let q = supabase
        .from("leads")
        .select(
          "id,code,lead_date,customer_name,customer_id,mobile,email,source,scope,destination_text,destination_id,travel_start,travel_end,city_nights,adults,children,infants,hotel_category,trip_type,budget,currency,priority,status,next_follow_up,assigned_to,special_requirements,notes,created_at,destinations(name,country)",
        )
        .is("deleted_at", null)
        .order("lead_date", { ascending: true });
      if (!hasFullLeadVisibility((roles ?? []).map(({ role }) => String(role)))) {
        q = q.eq("assigned_to", authData.user.id);
      }
      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status as never);
      if (filters?.scope && filters.scope !== "all") q = q.eq("scope", filters.scope as never);
      if (filters?.source && filters.source !== "all") q = q.eq("source", filters.source);
      if (filters?.search) q = q.ilike("customer_name", `%${filters.search}%`);
      if (filters?.owner === "mine" && filters.ownerId) q = q.eq("assigned_to", filters.ownerId);
      if (filters?.owner === "unassigned") q = q.is("assigned_to", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ["lead", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*, destinations(name,country)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useLeadItineraries(leadId: string, customerId?: string | null) {
  return useQuery({
    queryKey: ["lead-itineraries", leadId, customerId],
    enabled: Boolean(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itineraries")
        .select(
          "id,title,name,status,travel_start_date,travel_end_date,created_at,lead_id,customer_id,destination_id,destinations(name)",
        )
        .or(
          customerId ? `lead_id.eq.${leadId},customer_id.eq.${customerId}` : `lead_id.eq.${leadId}`,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type LeadNoteKind = "internal" | "client_requirement";

export function useLeadNoteEntries(leadId: string, kind: LeadNoteKind) {
  return useQuery({
    queryKey: ["lead-note-entries", leadId, kind],
    enabled: Boolean(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_note_entries")
        .select("*")
        .eq("lead_id", leadId)
        .eq("kind", kind)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddLeadNoteEntry(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, content }: { kind: LeadNoteKind; content: string }) => {
      const { error } = await supabase.from("lead_note_entries").insert({
        lead_id: leadId,
        kind,
        content: content.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Note added");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteLeadNoteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase
        .from("lead_note_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", entryId)
        .is("deleted_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Note deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select(
          "id,code,full_name,mobile,whatsapp,email,city,state,country,segment,tags,passport_number,passport_expiry,created_at",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (search) q = q.ilike("full_name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [customer, leads, enquiries, bookings, payments, requirements, itineraries] =
        await Promise.all([
          supabase.from("customers").select("*").eq("id", id).maybeSingle(),
          supabase
            .from("leads")
            .select("id,code,status,lead_date,destination_text,budget,currency")
            .eq("customer_id", id)
            .order("lead_date", { ascending: false }),
          supabase
            .from("enquiries")
            .select(
              "id,code,status,created_at,scope,destinations(name,country),departure_date,return_date",
            )
            .eq("customer_id", id)
            .order("created_at", { ascending: false }),
          supabase
            .from("bookings")
            .select(
              "id,code,status,payment_status,travel_start,travel_end,total_price,currency,adults,children",
            )
            .eq("customer_id", id)
            .order("booking_date", { ascending: false }),
          supabase
            .from("payments")
            .select("id,amount,currency,method,paid_on,direction,status")
            .eq("customer_id", id)
            .order("paid_on", { ascending: false }),
          supabase
            .from("customer_flow_requirements")
            .select("*")
            .eq("customer_id", id)
            .order("completed_at", { ascending: true })
            .order("wacrm_run_id", { ascending: true }),
          supabase
            .from("itineraries")
            .select(
              "id,title,name,status,travel_start_date,travel_end_date,created_at,booking_id,quotation_id,adults,children,destination_id,show_in_customer_bookings",
            )
            .eq("customer_id", id)
            .order("created_at", { ascending: false }),
        ]);
      if (customer.error) throw customer.error;
      if (requirements.error) throw requirements.error;
      let itineraryRows = itineraries.data ?? [];
      let itinerarySelectionAvailable = true;
      if (itineraries.error) {
        const supportsItinerarySelectionColumn =
          itineraries.error.message.includes("show_in_customer_bookings") &&
          ["42703", "PGRST204"].includes(itineraries.error.code);
        if (!supportsItinerarySelectionColumn) throw itineraries.error;

        console.warn(
          "[useCustomer] The show_in_customer_bookings column is missing. Apply migration 20261004143000_add_customer_booking_itinerary_selection.sql to enable itinerary selection.",
        );
        const legacyItineraries = await supabase
          .from("itineraries")
          .select(
            "id,title,name,status,travel_start_date,travel_end_date,created_at,booking_id,quotation_id,adults,children,destination_id",
          )
          .eq("customer_id", id)
          .order("created_at", { ascending: false });
        if (legacyItineraries.error) throw legacyItineraries.error;
        itineraryRows = (legacyItineraries.data ?? []).map((itinerary) => ({
          ...itinerary,
          show_in_customer_bookings: false,
        }));
        itinerarySelectionAvailable = false;
      }
      const destinationIds = [
        ...new Set(
          itineraryRows
            .map((itinerary) => itinerary.destination_id)
            .filter((destinationId): destinationId is string => Boolean(destinationId)),
        ),
      ];
      const destinationNames = new Map<string, string>();
      if (destinationIds.length > 0) {
        const { data: destinations, error: destinationsError } = await supabase
          .from("destinations")
          .select("id,name")
          .in("id", destinationIds);
        if (destinationsError) throw destinationsError;
        for (const destination of destinations ?? []) {
          destinationNames.set(destination.id, destination.name);
        }
      }
      return {
        customer: customer.data,
        leads: leads.data ?? [],
        enquiries: enquiries.data ?? [],
        bookings: bookings.data ?? [],
        payments: payments.data ?? [],
        requirements: requirements.data ?? [],
        itineraries: itineraryRows.map((itinerary) => ({
          ...itinerary,
          destinations: itinerary.destination_id
            ? { name: destinationNames.get(itinerary.destination_id) ?? null }
            : null,
        })),
        itinerarySelectionAvailable,
      };
    },
  });
}

import { ENQUIRY_PIPELINE_STAGES, getEnquiryStatusCandidates } from "@/lib/enquiry-pipeline";

export function useEnquiries(status?: string, owner?: { owner?: string; ownerId?: string | null }) {
  return useQuery({
    queryKey: ["enquiries", status, owner?.owner, owner?.ownerId],
    queryFn: async () => {
      let q = supabase
        .from("enquiries")
        .select(
          "id,code,enquiry_number,source,scope,customer_id,lead_id,assigned_to,departure_date,return_date,nights,adults,children,budget_per_person,total_budget,currency,hotel_category,status,requirements,created_at,customers(full_name),destinations(name,country)",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (status && status !== "all") {
        const validValues = getEnquiryStatusCandidates(status);
        q = q.in("status", validValues as never);
      }
      if (owner?.owner === "mine" && owner.ownerId) q = q.eq("assigned_to", owner.ownerId);
      if (owner?.owner === "unassigned") q = q.is("assigned_to", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useTasks(status?: string) {
  return useQuery({
    queryKey: ["tasks", status],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select(
          "id,title,description,due_date,due_time,priority,status,task_type,lead_id,enquiry_id,customer_id,booking_id,created_at",
        )
        .order("due_date", { ascending: true });
      if (status && status !== "all") q = q.eq("status", status as never);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCommunications(leadId?: string, customerId?: string) {
  return useQuery({
    queryKey: ["communications", leadId, customerId],
    enabled: Boolean(leadId || customerId),
    queryFn: async () => {
      let q = supabase
        .from("communications")
        .select("id,channel,direction,subject,body,occurred_at,status")
        .order("occurred_at", { ascending: false });
      q = leadId ? q.eq("lead_id", leadId) : q.eq("customer_id", customerId!);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [leads, bookings, payments, tasks, quotations] = await Promise.all([
        supabase
          .from("leads")
          .select("id,status,source,scope,budget,lead_date,priority,next_follow_up,customer_name")
          .is("deleted_at", null),
        supabase
          .from("bookings")
          .select("id,code,status,payment_status,total_price,total_cost,travel_start,booking_date")
          .is("deleted_at", null),
        supabase.from("payments").select("id,amount,direction,paid_on,status"),
        supabase.from("tasks").select("id,title,status,due_date,priority"),
        supabase.from("quotations").select("id,status,total_price").is("deleted_at", null),
      ]);
      return {
        leads: leads.data ?? [],
        bookings: bookings.data ?? [],
        payments: payments.data ?? [],
        tasks: tasks.data ?? [],
        quotations: quotations.data ?? [],
      };
    },
  });
}

/** Generic row mutation with cache invalidation + toast. */
export function useUpsert(table: "leads" | "customers" | "enquiries" | "tasks", label: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string | undefined;
      values: Record<string, unknown>;
    }) => {
      if (id) {
        if (table === "leads") {
          const { count, error } = await supabase
            .from(table)
            .update(values as never, { count: "exact" })
            .eq("id", id);
          if (error) throw error;
          if (count === 0) {
            throw new Error(
              "Lead was not updated. It may have been deleted or you may not have permission to edit it.",
            );
          }
          return id;
        }
        const { error } = await supabase
          .from(table)
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      if (table === "enquiries") {
        const { data, error } = await supabase
          .rpc("create_enquiry", {
            p_customer_id: (values["customer_id"] as string | null | undefined) ?? null,
            p_source: (values["source"] as string | undefined) ?? "MANUAL",
            p_destination_id: (values["destination_id"] as string | null | undefined) ?? null,
            p_assigned_employee_id: (values["assigned_to"] as string | null | undefined) ?? null,
            p_status: (values["status"] as string | undefined) ?? "new",
          })
          .single();
        if (error) throw error;
        const enquiryId = data.id as string;
        const { error: updateError } = await supabase
          .from(table)
          .update(values as never)
          .eq("id", enquiryId);
        if (updateError) throw updateError;
        return enquiryId;
      }
      const { data, error } = await supabase
        .from(table)
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(`${label} saved`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLogCommunication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("communications").insert(values as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communications"] });
      toast.success("Activity logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ============================ Phase 2: Quotations & Itineraries ============================ */

export function useQuotations(status?: string) {
  return useQuery({
    queryKey: ["quotations", status],
    queryFn: async () => {
      let q = supabase
        .from("quotations")
        .select(
          "id,code,version,title,scope,travel_start,travel_end,adults,children,currency,total_cost,total_price,status,valid_until,created_at,customers(full_name),destinations(name,country)",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (status && status !== "all") q = q.eq("status", status as never);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useQuotation(id: string) {
  return useQuery({
    queryKey: ["quotation", id],
    queryFn: async () => {
      const [quotation, items, itineraries] = await Promise.all([
        supabase
          .from("quotations")
          .select("*, customers(full_name,mobile,email), destinations(name,country)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("quotation_items")
          .select(
            "*, suppliers(name,category,supplier_types), hotel_bookings(*, suppliers(name)), transport_services(*, suppliers(name)), activity_services(*, suppliers(name))",
          )

          .eq("quotation_id", id)
          .order("sort_order", { ascending: true }),
        supabase.from("itineraries").select("id,title,summary").eq("quotation_id", id),
      ]);
      if (quotation.error) throw quotation.error;
      const itinerary = itineraries.data?.[0] ?? null;
      let days: Array<Record<string, unknown>> = [];
      if (itinerary) {
        const { data } = await supabase
          .from("itinerary_days")
          .select("*")
          .eq("itinerary_id", itinerary.id)
          .order("day_number", { ascending: true });
        days = (data ?? []) as Array<Record<string, unknown>>;
      }
      return { quotation: quotation.data, items: items.data ?? [], itinerary, days };
    },
    enabled: Boolean(id),
  });
}

export function useSuppliers(category?: string) {
  return useQuery({
    queryKey: ["suppliers", category],
    queryFn: async () => {
      let q = supabase
        .from("suppliers")
        .select("id,name,category,supplier_types,city,country,region")
        .eq("is_active", true)
        .order("name");
      if (category && category !== "all") q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

function mutate(qc: ReturnType<typeof useQueryClient>, label: string) {
  return {
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(label);
    },
    onError: (e: Error) => toast.error(e.message),
  };
}

export function useCreateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("quotations")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    ...mutate(qc, "Quotation created"),
  });
}

export function useUpdateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("quotations")
        .update(values as never)
        .eq("id", id);
      if (error) throw error;
    },
    ...mutate(qc, "Quotation updated"),
  });
}

export function useQuotationItems(quotationId: string) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase
        .from("quotation_items")
        .insert({ ...values, quotation_id: quotationId } as never);
      if (error) throw error;
    },
    ...mutate(qc, "Item added"),
  });
  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("quotation_items")
        .update(values as never)
        .eq("id", id);
      if (error) throw error;
    },
    ...mutate(qc, "Item updated"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotation_items").delete().eq("id", id);
      if (error) throw error;
    },
    ...mutate(qc, "Item removed"),
  });
  return { add, update, remove };
}

export function useItineraryBuilder(quotationId: string) {
  const qc = useQueryClient();
  const ensure = useMutation({
    mutationFn: async (title: string) => {
      const { data: existing } = await supabase
        .from("itineraries")
        .select("id")
        .eq("quotation_id", quotationId)
        .maybeSingle();
      if (existing) return existing.id as string;
      const { data, error } = await supabase
        .from("itineraries")
        .insert({ quotation_id: quotationId, title } as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    ...mutate(qc, "Itinerary ready"),
  });
  const addDay = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from("itinerary_days").insert(values as never);
      if (error) throw error;
    },
    ...mutate(qc, "Day added"),
  });
  const updateDay = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("itinerary_days")
        .update(values as never)
        .eq("id", id);
      if (error) throw error;
    },
    ...mutate(qc, "Day updated"),
  });
  const removeDay = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("itinerary_days").delete().eq("id", id);
      if (error) throw error;
    },
    ...mutate(qc, "Day removed"),
  });
  return { ensure, addDay, updateDay, removeDay };
}

/* ============================ Phase 3: Bookings, Payments, Suppliers ============================ */

export function useBookings(filters?: { status?: string; payment?: string }) {
  return useQuery({
    queryKey: ["bookings", filters],
    queryFn: async () => {
      let q = supabase
        .from("bookings")
        .select(
          "id,code,invoice_code,invoice_date,scope,booking_date,travel_start,travel_end,adults,children,currency,total_cost,total_price,amount_received,payment_deadline,status,payment_status,visa_status,created_at,customers(full_name,mobile),destinations(name,country)",
        )
        .is("deleted_at", null)
        .order("booking_date", { ascending: false });
      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status as never);
      if (filters?.payment && filters.payment !== "all")
        q = q.eq("payment_status", filters.payment as never);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: ["booking", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [booking, items, payments, travellers, documents] = await Promise.all([
        supabase
          .from("bookings")
          .select("*, customers(full_name,mobile,email), destinations(name,country)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("booking_items")
          .select(
            "*, suppliers(name,category,supplier_types), hotel_bookings(*, suppliers(name)), transport_services(*, suppliers(name)), activity_services(*, suppliers(name))",
          )

          .eq("booking_id", id)
          .order("created_at"),
        supabase
          .from("payments")
          .select("*")
          .eq("booking_id", id)
          .order("paid_on", { ascending: false }),
        supabase
          .from("booking_travellers")
          .select(
            "id,booking_id,traveller_id,created_at,travellers(id,full_name,traveller_type,relation,gender,date_of_birth,nationality,passport_number,passport_expiry,visa_status,meal_preference,special_requirements,is_primary)",
          )
          .eq("booking_id", id)
          .order("created_at"),
        supabase.from("documents").select("*").eq("booking_id", id).order("created_at"),
      ]);
      if (booking.error) throw booking.error;
      if (travellers.error) throw travellers.error;
      return {
        booking: booking.data,
        items: items.data ?? [],
        payments: payments.data ?? [],
        travellers: travellers.data ?? [],
        documents: documents.data ?? [],
      };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Booking travellers                                                  */
/* ------------------------------------------------------------------ */

/** Lightweight traveller picker list — deliberately excludes passport fields. */
export function useTravellerOptions(search?: string) {
  return useQuery({
    queryKey: ["traveller-options", search ?? ""],
    queryFn: async () => {
      let q = supabase
        .from("travellers")
        .select("id,full_name,traveller_type,relation,group_id,customer_id")
        .order("full_name")
        .limit(50);
      if (search) q = q.ilike("full_name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddTravellerToBooking(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { traveller_id?: string; values?: Record<string, unknown> }) => {
      let travellerId = input.traveller_id;
      if (!travellerId) {
        const { data, error } = await supabase
          .from("travellers")
          .insert((input.values ?? {}) as never)
          .select("id")
          .single();
        if (error) throw error;
        travellerId = data.id as string;
      }
      const { error } = await supabase
        .from("booking_travellers")
        .insert({ booking_id: bookingId, traveller_id: travellerId } as never);
      if (error) throw error;
      return travellerId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking", bookingId] });
      qc.invalidateQueries({ queryKey: ["traveller-options"] });
      toast.success("Traveller added to booking");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Removes only the booking association; the traveller master record is kept. */
export function useRemoveTravellerFromBooking(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from("booking_travellers").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking", bookingId] });
      toast.success("Traveller removed from this booking");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Quotation → booking conversion is performed atomically by the database RPC. */
export function useConvertQuotationToBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quotationId: string) => {
      const { data, error } = await supabase.rpc("convert_quotation_to_booking", {
        p_quotation_id: quotationId,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Conversion did not return a booking");
      return data as string;
    },
    ...mutate(qc, "Booking created from quotation"),
  });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("bookings")
        .update(values as never)
        .eq("id", id);
      if (error) throw error;
    },
    ...mutate(qc, "Booking updated"),
  });
}

export function useUpdateBookingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("booking_items")
        .update(values as never)
        .eq("id", id);
      if (error) throw error;
    },
    ...mutate(qc, "Service updated"),
  });
}

/* ------------------------------------------------------------------ */
/* Hotel services                                                      */
/* ------------------------------------------------------------------ */

export type HotelServiceInput = {
  /** Which service line owns the stay. */
  parent: "booking" | "quotation";
  /** bookings.id or quotations.id */
  parentId: string;
  /** booking_items.id / quotation_items.id when editing. */
  itemId?: string | null;
  /** hotel_bookings.id when editing. */
  hotelId?: string | null;
  /** Financial + service-line fields — booking_items / quotation_items stay authoritative. */
  item: Record<string, unknown>;
  /** Structured hotel fields (no financial columns). */
  hotel: Record<string, unknown>;
};

/**
 * Creates or updates a hotel service: the financial service line
 * (booking_items / quotation_items) plus its structured hotel_bookings row.
 * Pricing lives only on the service line, so Task 3 booking totals stay
 * database-authoritative and are recalculated by the existing triggers.
 */
export function useSaveHotelService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ parent, parentId, itemId, hotelId, item, hotel }: HotelServiceInput) => {
      const table = parent === "booking" ? "booking_items" : "quotation_items";
      const parentKey = parent === "booking" ? "booking_id" : "quotation_id";
      const linkKey = parent === "booking" ? "booking_item_id" : "quotation_item_id";
      let serviceId = itemId ?? null;
      let createdServiceId: string | null = null;

      if (serviceId) {
        const { error } = await supabase
          .from(table)
          .update({ ...item, item_type: "hotel" } as never)
          .eq("id", serviceId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from(table)
          .insert({ ...item, item_type: "hotel", [parentKey]: parentId } as never)
          .select("id")
          .single();
        if (error) throw error;
        serviceId = data.id as string;
        createdServiceId = serviceId;
      }

      try {
        if (hotelId) {
          const { error } = await supabase
            .from("hotel_bookings")
            .update(hotel as never)
            .eq("id", hotelId);
          if (error) throw error;
        } else {
          // One stay per service line (partial unique index on the link column).
          // PostgREST cannot infer a partial index for ON CONFLICT, so look the
          // row up first and insert or update accordingly.
          const { data: existing, error: findError } = await supabase
            .from("hotel_bookings")
            .select("id")
            .eq(linkKey, serviceId)
            .maybeSingle();
          if (findError) throw findError;
          if (existing?.id) {
            const { error } = await supabase
              .from("hotel_bookings")
              .update(hotel as never)
              .eq("id", existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("hotel_bookings")
              .insert({ ...hotel, [linkKey]: serviceId } as never);
            if (error) throw error;
          }
        }
      } catch (e) {
        // The hotel detail failed: roll back a service line we just created so
        // the UI never shows a priced line without its stay, and retry is clean.
        if (createdServiceId) await supabase.from(table).delete().eq("id", createdServiceId);
        throw e;
      }
      return serviceId;
    },
    ...mutate(qc, "Hotel service saved"),
  });
}

/* ------------------------------------------------------------------ */
/* Transport services                                                  */
/* ------------------------------------------------------------------ */

export type TransportServiceInput = {
  /** Which service line owns the transport. */
  parent: "booking" | "quotation";
  /** bookings.id or quotations.id */
  parentId: string;
  /** booking_items.id / quotation_items.id when editing. */
  itemId?: string | null;
  /** transport_services.id when editing. */
  transportId?: string | null;
  /** Financial + service-line fields — booking_items / quotation_items stay authoritative. */
  item: Record<string, unknown>;
  /** Structured transport fields (no financial columns). */
  transport: Record<string, unknown>;
};

/**
 * Creates or updates a transport service: the financial service line
 * (booking_items / quotation_items) plus its structured transport_services row.
 * Pricing lives only on the service line, so Task 3 booking totals stay
 * database-authoritative and are recalculated by the existing triggers.
 */
export function useSaveTransportService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      parent,
      parentId,
      itemId,
      transportId,
      item,
      transport,
    }: TransportServiceInput) => {
      const table = parent === "booking" ? "booking_items" : "quotation_items";
      const parentKey = parent === "booking" ? "booking_id" : "quotation_id";
      const linkKey = parent === "booking" ? "booking_item_id" : "quotation_item_id";
      let serviceId = itemId ?? null;
      let createdServiceId: string | null = null;

      if (serviceId) {
        const { error } = await supabase
          .from(table)
          .update({ ...item, item_type: "transfer" } as never)
          .eq("id", serviceId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from(table)
          .insert({ ...item, item_type: "transfer", [parentKey]: parentId } as never)
          .select("id")
          .single();
        if (error) throw error;
        serviceId = data.id as string;
        createdServiceId = serviceId;
      }

      try {
        if (transportId) {
          const { error } = await supabase
            .from("transport_services")
            .update(transport as never)
            .eq("id", transportId);
          if (error) throw error;
        } else {
          // One transport row per service line (partial unique index on the link
          // column). PostgREST cannot infer a partial index for ON CONFLICT, so
          // insert and fall back to an update when a row already exists.
          const { data: existing, error: findError } = await supabase
            .from("transport_services")
            .select("id")
            .eq(linkKey, serviceId)
            .maybeSingle();
          if (findError) throw findError;
          if (existing?.id) {
            const { error } = await supabase
              .from("transport_services")
              .update(transport as never)
              .eq("id", existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("transport_services")
              .insert({ ...transport, [linkKey]: serviceId } as never);
            if (error) throw error;
          }
        }
      } catch (e) {
        // Roll back a service line we just created so the UI never shows a
        // priced line without its transport detail.
        if (createdServiceId) await supabase.from(table).delete().eq("id", createdServiceId);
        throw e;
      }
      return serviceId;
    },
    ...mutate(qc, "Transport service saved"),
  });
}

/* ------------------------------------------------------------------ */
/* Activity / sightseeing services                                     */
/* ------------------------------------------------------------------ */

export type ActivityServiceInput = {
  /** Which service line owns the activity. */
  parent: "booking" | "quotation";
  /** bookings.id or quotations.id */
  parentId: string;
  /** booking_items.id / quotation_items.id when editing. */
  itemId?: string | null;
  /** activity_services.id when editing. */
  activityId?: string | null;
  /** Financial + service-line fields — booking_items / quotation_items stay authoritative. */
  item: Record<string, unknown>;
  /** Structured activity fields (no financial columns). */
  activity: Record<string, unknown>;
};

/**
 * Creates or updates an activity/sightseeing service: the financial service
 * line (booking_items / quotation_items) plus its structured activity_services
 * row. Pricing lives only on the service line, so booking totals stay
 * database-authoritative and are recalculated by the existing triggers.
 */
export function useSaveActivityService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      parent,
      parentId,
      itemId,
      activityId,
      item,
      activity,
    }: ActivityServiceInput) => {
      const table = parent === "booking" ? "booking_items" : "quotation_items";
      const parentKey = parent === "booking" ? "booking_id" : "quotation_id";
      const linkKey = parent === "booking" ? "booking_item_id" : "quotation_item_id";
      let serviceId = itemId ?? null;
      let createdServiceId: string | null = null;

      if (serviceId) {
        const { error } = await supabase
          .from(table)
          .update({ ...item, item_type: "activity" } as never)
          .eq("id", serviceId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from(table)
          .insert({ ...item, item_type: "activity", [parentKey]: parentId } as never)
          .select("id")
          .single();
        if (error) throw error;
        serviceId = data.id as string;
        createdServiceId = serviceId;
      }

      try {
        if (activityId) {
          const { error } = await supabase
            .from("activity_services")
            .update(activity as never)
            .eq("id", activityId);
          if (error) throw error;
        } else {
          // One activity row per service line (partial unique index on the link
          // column). PostgREST cannot infer a partial index for ON CONFLICT, so
          // look up and fall back to an update when a row already exists.
          const { data: existing, error: findError } = await supabase
            .from("activity_services")
            .select("id")
            .eq(linkKey, serviceId)
            .maybeSingle();
          if (findError) throw findError;
          if (existing?.id) {
            const { error } = await supabase
              .from("activity_services")
              .update(activity as never)
              .eq("id", existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("activity_services")
              .insert({ ...activity, [linkKey]: serviceId } as never);
            if (error) throw error;
          }
        }
      } catch (e) {
        // Roll back a service line we just created so the UI never shows a
        // priced line without its activity detail.
        if (createdServiceId) await supabase.from(table).delete().eq("id", createdServiceId);
        throw e;
      }
      return serviceId;
    },
    ...mutate(qc, "Activity service saved"),
  });
}

export function usePayments(direction?: string) {
  return useQuery({
    queryKey: ["payments", direction],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select(
          "id,code,receipt_code,direction,amount,currency,method,reference,paid_on,status,notes,booking_id,customers(full_name),suppliers(name),bookings(code,total_price)",
        )
        .order("paid_on", { ascending: false });
      if (direction && direction !== "all") q = q.eq("direction", direction);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Record a payment through the atomic database RPC. The RPC inserts the payment and
 * re-derives amount_received / payment_status inside one transaction — the browser
 * never computes or writes those values.
 */
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));
      const { data, error } = await supabase.rpc("record_booking_payment", {
        p_booking_id: str(values["booking_id"]),
        p_amount: Number(values["amount"] ?? 0),
        p_method: str(values["method"]) ?? "other",
        p_paid_on: str(values["paid_on"]),
        p_direction: str(values["direction"]) ?? "inbound",
        p_customer_id: str(values["customer_id"]),
        p_supplier_id: str(values["supplier_id"]),
        p_reference: str(values["reference"]),
        p_notes: str(values["notes"]),
        p_currency: str(values["currency"]),
        p_status: str(values["status"]) ?? "completed",
      } as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    ...mutate(qc, "Payment recorded"),
  });
}

export function useUpsertSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string | undefined;
      values: Record<string, unknown>;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("suppliers")
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("suppliers")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    ...mutate(qc, "Supplier saved"),
  });
}

export function useSuppliersFull(search?: string) {
  return useQuery({
    queryKey: ["suppliers-full", search],
    queryFn: async () => {
      let q = supabase.from("suppliers").select("*").order("name");
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

/* ============================ Phase 4: Documents, Reports, Settings ============================ */

export function useDocuments(filters?: { status?: string; type?: string; search?: string }) {
  return useQuery({
    queryKey: ["documents", filters],
    queryFn: async () => {
      let q = supabase
        .from("documents")
        .select(
          "id,name,doc_type,status,expiry_date,notes,file_path,booking_id,customer_id,traveller_id,created_at,bookings(code),customers(full_name),travellers(full_name)",
        )
        .order("created_at", { ascending: false });
      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters?.type && filters.type !== "all") q = q.eq("doc_type", filters.type);
      if (filters?.search) q = q.ilike("name", `%${filters.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string | undefined;
      values: Record<string, unknown>;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("documents")
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("documents")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["visa-board"] });
      toast.success("Document saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useVisaBoard() {
  return useQuery({
    queryKey: ["visa-board"],
    queryFn: async () => {
      const [bookings, travellers] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            "id,code,visa_status,scope,travel_start,customers(full_name),destinations(name,country)",
          )
          .is("deleted_at", null)
          .neq("scope", "domestic")
          .order("travel_start"),
        supabase
          .from("travellers")
          .select("id,full_name,visa_status,passport_number,passport_expiry,nationality")
          .order("full_name"),
      ]);
      if (bookings.error) throw bookings.error;
      if (travellers.error) throw travellers.error;
      return { bookings: bookings.data ?? [], travellers: travellers.data ?? [] };
    },
  });
}

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [leads, quotations, bookings, payments, profiles] = await Promise.all([
        supabase
          .from("leads")
          .select(
            "id,status,source,scope,budget,lead_date,assigned_to,destination_id,destinations(name)",
          )
          .is("deleted_at", null),
        supabase
          .from("quotations")
          .select("id,status,total_price,created_at")
          .is("deleted_at", null),
        supabase
          .from("bookings")
          .select(
            "id,code,status,payment_status,total_price,total_cost,amount_received,booking_date,travel_start,scope,assigned_to,destination_id,destinations(name,country)",
          )
          .is("deleted_at", null),
        supabase.from("payments").select("id,amount,direction,paid_on,status,method"),
        getBusinessVisibleProfiles(),
      ]);
      return {
        leads: leads.data ?? [],
        quotations: quotations.data ?? [],
        bookings: bookings.data ?? [],
        payments: payments.data ?? [],
        profiles,
      };
    },
  });
}

export function useAppSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key,value,updated_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveAppSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key, value } as never, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useMessageTemplates() {
  return useQuery({
    queryKey: ["message-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string | undefined;
      values: Record<string, unknown>;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("message_templates")
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("message_templates")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success("Template saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Packages library                                                    */
/* ------------------------------------------------------------------ */

export function usePackages(filters?: { scope?: string; search?: string }) {
  return useQuery({
    queryKey: ["packages", filters],
    queryFn: async () => {
      let q = supabase
        .from("packages")
        .select(
          "id,code,name,scope,nights,days,starting_price,currency,description,highlights,inclusions,exclusions,hotel_category,season,image_url,is_active,destination_id,destinations(name,country)",
        )
        .order("created_at", { ascending: false });
      if (filters?.scope && filters.scope !== "all") q = q.eq("scope", filters.scope as never);
      if (filters?.search) q = q.ilike("name", `%${filters.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string | undefined;
      values: Record<string, unknown>;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("packages")
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("packages")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      toast.success("Package saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Itinerary library                                                   */
/* ------------------------------------------------------------------ */

export type ItineraryListRow = {
  id: string;
  name: string;
  description?: string | null;
  destination_id?: string | null;
  duration_nights?: number | null;
  duration_days?: number | null;
  price?: number | string | null;
  currency?: string | null;
  hotel_category?: string | null;
  trip_type?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  is_active: boolean;
  created_at: string;
  document_name?: string | null;
  document_path?: string | null;
  document_mime_type?: string | null;
  destinations?: {
    name?: string | null;
    country?: string | null;
  } | null;
};

export function useItineraries(filters?: {
  search?: string;
  destinationId?: string;
  status?: string;
}) {
  return useQuery<ItineraryListRow[]>({
    queryKey: ["itineraries", filters],
    queryFn: async () => {
      let q = supabase
        .from("itineraries")
        .select(
          "id,name,destination_id,duration_nights,duration_days,price,currency,hotel_category,trip_type,description,valid_from,valid_until,document_path,document_name,document_mime_type,document_size,is_active,created_at,updated_at",
        )
        .order("created_at", { ascending: false });
      if (filters?.destinationId) q = q.eq("destination_id", filters.destinationId as never);
      if (filters?.status === "active") q = q.eq("is_active", true as never);
      if (filters?.status === "inactive") q = q.eq("is_active", false as never);
      if (filters?.search) q = q.ilike("name", `%${filters.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ItineraryListRow[];
    },
  });
}

export type ItineraryWorkspaceRow = {
  id: string;
  title?: string | null;
  name?: string | null;
  version?: string | number | null;
  travel_start_date?: string | null;
  travel_end_date?: string | null;
  adults?: number | null;
  children?: number | null;
  created_at: string;
  created_by?: string | null;
  lead_id?: string | null;
  destinations?: { name?: string | null } | null;
  leads?: { customer_name?: string | null } | null;
  customers?: { full_name?: string | null } | null;
  profiles?: { full_name?: string | null; email?: string | null } | null;
};

export function useItineraryWorkspaceRows(search?: string) {
  return useQuery<ItineraryWorkspaceRow[]>({
    queryKey: ["itinerary-workspace", search],
    queryFn: async () => {
      let query = supabase
        .from("itineraries")
        .select(
          "id,title,name,travel_start_date,travel_end_date,adults,children,created_at,created_by,lead_id,destinations(name),leads(customer_name),customers(full_name),profiles:created_by(full_name,email)",
        )
        .order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as ItineraryWorkspaceRow[];
      const term = search?.trim().toLocaleLowerCase();
      if (!term) return rows;

      return rows.filter((row) =>
        [
          row.id,
          row.title,
          row.name,
          row.destinations?.name,
          row.leads?.customer_name,
          row.customers?.full_name,
          row.profiles?.full_name,
          row.profiles?.email,
        ].some((value) => value?.toLocaleLowerCase().includes(term)),
      );
    },
  });
}

export type ItineraryDraftWorkspaceRow = {
  id: string;
  itinerary_id: string | null;
  lead_id: string | null;
  draft_data: import("@/integrations/supabase/types").Json;
  updated_at: string;
};

function getDraftItineraryId(draft: ItineraryDraftWorkspaceRow) {
  if (draft.itinerary_id) return draft.itinerary_id;
  const draftData = draft.draft_data;
  return draftData &&
    typeof draftData === "object" &&
    !Array.isArray(draftData) &&
    typeof draftData["itineraryId"] === "string"
    ? draftData["itineraryId"]
    : null;
}

export function filterUnsavedItineraryDraftRows(
  drafts: ItineraryDraftWorkspaceRow[],
  savedItineraryIds: ReadonlySet<string>,
) {
  return drafts.filter((draft) => {
    const itineraryId = getDraftItineraryId(draft);
    return !itineraryId || !savedItineraryIds.has(itineraryId);
  });
}

export function dedupeItineraryDraftRows(drafts: ItineraryDraftWorkspaceRow[]) {
  const latestByScope = new Map<string, ItineraryDraftWorkspaceRow>();
  for (const draft of drafts) {
    const itineraryId = getDraftItineraryId(draft);
    const scope = itineraryId
      ? `itinerary:${itineraryId}`
      : draft.lead_id
        ? `lead:${draft.lead_id}`
        : `draft:${draft.id}`;
    const previous = latestByScope.get(scope);
    if (
      !previous ||
      new Date(draft.updated_at).getTime() >= new Date(previous.updated_at).getTime()
    )
      latestByScope.set(scope, draft);
  }
  return [...latestByScope.values()].sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at),
  );
}

export function useItineraryDraftWorkspaceRows() {
  return useQuery<ItineraryDraftWorkspaceRow[]>({
    queryKey: ["itinerary-drafts"],
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) return [];
      const localDrafts: ItineraryDraftWorkspaceRow[] = [];
      if (typeof window !== "undefined") {
        const prefix = `savr-itinerary-draft:${authData.user.id}:`;
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (!key?.startsWith(prefix) || !key.endsWith(":snapshot")) continue;
          const storageBase = key.slice(0, -":snapshot".length);
          try {
            const draftId = window.localStorage.getItem(`${storageBase}:id`);
            const entry = JSON.parse(window.localStorage.getItem(key) ?? "null") as {
              savedAt?: number;
              snapshot?: unknown;
            } | null;
            if (
              !draftId ||
              !entry?.snapshot ||
              typeof entry.snapshot !== "object" ||
              Array.isArray(entry.snapshot)
            )
              continue;
            const snapshot = entry.snapshot as Record<string, unknown>;
            localDrafts.push({
              id: draftId,
              itinerary_id:
                typeof snapshot["itineraryId"] === "string" ? snapshot["itineraryId"] : null,
              lead_id:
                snapshot["form"] &&
                typeof snapshot["form"] === "object" &&
                !Array.isArray(snapshot["form"]) &&
                typeof (snapshot["form"] as Record<string, unknown>)["lead_id"] === "string"
                  ? ((snapshot["form"] as Record<string, unknown>)["lead_id"] as string)
                  : null,
              draft_data: entry.snapshot as ItineraryDraftWorkspaceRow["draft_data"],
              updated_at: new Date(Number(entry.savedAt ?? Date.now())).toISOString(),
            });
          } catch {
            // Ignore malformed local draft entries and continue listing recoverable drafts.
          }
        }
      }
      const { data, error } = await supabase
        .from("itinerary_drafts")
        .select("id,itinerary_id,lead_id,draft_data,updated_at")
        .eq("user_id", authData.user.id)
        .order("updated_at", { ascending: false });
      if (error) {
        if (localDrafts.length === 0) throw error;
        console.warn(
          "[Itinerary drafts] Database drafts unavailable; filtering browser drafts against saved itineraries.",
          error,
        );
      }
      const mergedDrafts = new Map(localDrafts.map((draft) => [draft.id, draft]));
      for (const draft of (data ?? []) as ItineraryDraftWorkspaceRow[]) {
        const local = mergedDrafts.get(draft.id);
        if (!local || new Date(draft.updated_at).getTime() >= new Date(local.updated_at).getTime())
          mergedDrafts.set(draft.id, draft);
      }
      const drafts = [...mergedDrafts.values()];
      const itineraryIds = [
        ...new Set(
          drafts.flatMap((draft) => {
            const itineraryId = getDraftItineraryId(draft);
            return itineraryId ? [itineraryId] : [];
          }),
        ),
      ];
      if (itineraryIds.length === 0) return dedupeItineraryDraftRows(drafts);

      const { data: savedItineraries, error: itineraryError } = await supabase
        .from("itineraries")
        .select("id,status")
        .in("id", itineraryIds);
      if (itineraryError) throw itineraryError;
      const savedItineraryIds = new Set(
        (savedItineraries ?? [])
          .filter((itinerary) => itinerary.status === "READY")
          .map((itinerary) => itinerary.id),
      );
      return dedupeItineraryDraftRows(filterUnsavedItineraryDraftRows(drafts, savedItineraryIds));
    },
  });
}

export function useDeleteItineraryDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Sign in to delete this draft.");

      const { error } = await supabase
        .from("itinerary_drafts")
        .delete()
        .eq("id", draftId)
        .eq("user_id", authData.user.id);
      if (error) throw error;

      if (typeof window !== "undefined") {
        const prefix = `savr-itinerary-draft:${authData.user.id}:`;
        const storageBases: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (!key?.startsWith(prefix) || !key.endsWith(":id")) continue;
          if (window.localStorage.getItem(key) !== draftId) continue;
          storageBases.push(key.slice(0, -":id".length));
        }
        for (const storageBase of storageBases) {
          window.localStorage.removeItem(`${storageBase}:id`);
          window.localStorage.removeItem(`${storageBase}:snapshot`);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itinerary-drafts"] });
      toast.success("Draft deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useItinerary(id: string) {
  return useQuery({
    queryKey: ["itinerary", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itineraries")
        .select(
          "id,name,destination_id,duration_nights,duration_days,price,currency,hotel_category,trip_type,description,valid_from,valid_until,document_path,document_name,document_mime_type,document_size,is_active,created_at,updated_at,destinations(name,country)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateItinerary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("itineraries")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itineraries"] });
      toast.success("Itinerary created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateItinerary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("itineraries")
        .update(values as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itineraries"] });
      toast.success("Itinerary updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleItineraryActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("itineraries")
        .update({ is_active, updated_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itineraries"] });
      toast.success("Itinerary status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUploadItineraryDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file, path }: { id: string; file: File; path: string }) => {
      const { error: uploadError } = await supabase.storage.from("itineraries").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { error } = await supabase
        .from("itineraries")
        .update({
          document_path: path,
          document_name: file.name,
          document_mime_type: file.type,
          document_size: file.size,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itineraries"] });
      toast.success("Itinerary PDF uploaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteItineraryDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: current } = await supabase
        .from("itineraries")
        .select("document_path")
        .eq("id", id)
        .maybeSingle();

      if ((current as any)?.document_path) {
        await supabase.storage.from("itineraries").remove([(current as any).document_path]);
      }

      const { error } = await supabase
        .from("itineraries")
        .update({
          document_path: null,
          document_name: null,
          document_mime_type: null,
          document_size: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["itineraries"] });
      toast.success("Document removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Travel groups & travellers                                          */
/* ------------------------------------------------------------------ */

export function useTravelGroups(search?: string) {
  return useQuery({
    queryKey: ["travel-groups", search],
    queryFn: async () => {
      let q = supabase
        .from("travel_groups")
        .select(
          "id,name,notes,created_at,primary_customer_id,customers(full_name,mobile),travellers(id)",
        )
        .order("created_at", { ascending: false });
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useTravelGroup(id: string) {
  return useQuery({
    queryKey: ["travel-group", id],
    enabled: !!id,
    queryFn: async () => {
      const [group, travellers] = await Promise.all([
        supabase
          .from("travel_groups")
          .select("id,name,notes,primary_customer_id,customers(id,full_name,mobile,email)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("travellers")
          .select("*")
          .eq("group_id", id)
          .order("is_primary", { ascending: false }),
      ]);
      if (group.error) throw group.error;
      if (travellers.error) throw travellers.error;
      return { group: group.data, travellers: travellers.data ?? [] };
    },
  });
}

export function useCreateTravelGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("travel_groups")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-groups"] });
      toast.success("Group created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpsertTraveller(groupId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string | undefined;
      values: Record<string, unknown>;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("travellers")
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("travellers")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-group", groupId ?? ""] });
      qc.invalidateQueries({ queryKey: ["travel-groups"] });
      toast.success("Traveller saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTraveller(groupId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("travellers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-group", groupId ?? ""] });
      toast.success("Traveller removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,category,link,is_read,created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useMarkNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true } as never)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

export function useActivityLogs(entityType?: string) {
  return useQuery({
    queryKey: ["activity-logs", entityType],
    queryFn: async () => {
      let q = supabase
        .from("activity_logs")
        .select("id,entity_type,entity_id,action,summary,actor_id,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (entityType && entityType !== "all") q = q.eq("entity_type", entityType);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Automation rules                                                    */
/* ------------------------------------------------------------------ */

export function useAutomationRules() {
  return useQuery({
    queryKey: ["automation-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string | undefined;
      values: Record<string, unknown>;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("automation_rules")
          .update(values as never)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("automation_rules")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Automation saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Create a direct booking (walk-in / flight-only / visa-only) without a quotation. */
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("bookings")
        .insert(values as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    ...mutate(qc, "Booking created"),
  });
}

/** Lightweight booking list for pickers (payments, invoices). */
export function useBookingOptions() {
  return useQuery({
    queryKey: ["booking-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,code,total_price,amount_received,currency,customer_id,customers(full_name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });
}

/** Soft-delete a record (sets deleted_at) so history and reports stay intact. */
export function useSoftDelete(
  table: "leads" | "customers" | "enquiries" | "bookings" | "quotations",
  label: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    ...mutate(qc, `${label} deleted`),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("customers")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error?.code === "23503") {
        throw new Error(
          "This customer has linked records that prevent permanent deletion, such as payment history. No records were removed. Remove or reassign those records first.",
        );
      }
      if (error) throw error;
      if (!data) {
        throw new Error("Customer was not deleted. It may no longer exist or you may lack access.");
      }
      return data.id;
    },
    ...mutate(qc, "Customer permanently deleted"),
  });
}

/** Delete a payment. Database triggers re-derive the booking's collection totals. */
export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; bookingId?: string | null }) => {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    ...mutate(qc, "Payment deleted"),
  });
}

/* ── Pipeline conversions: lead → customer → enquiry → quotation → booking → payment ── */

/** Create (or reuse) a customer record from a lead and link them. */
export function useConvertLeadToCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data: lead, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();
      if (error) throw error;
      if (lead.customer_id) return lead.customer_id as string;

      if (lead.mobile) {
        const { data: match } = await supabase
          .from("customers")
          .select("id")
          .eq("mobile", lead.mobile)
          .is("deleted_at", null)
          .maybeSingle();
        if (match) {
          await supabase
            .from("leads")
            .update({ customer_id: match.id } as never)
            .eq("id", leadId);
          return match.id as string;
        }
      }

      const { data: customer, error: cErr } = await supabase
        .from("customers")
        .insert({
          full_name: lead.customer_name,
          mobile: lead.mobile,
          whatsapp: lead.whatsapp ?? lead.mobile,
          email: lead.email,
          segment: "prospect",
          notes: lead.notes,
          owner_id: lead.assigned_to,
        } as never)
        .select("id")
        .single();
      if (cErr) throw cErr;
      await supabase
        .from("leads")
        .update({ customer_id: customer.id } as never)
        .eq("id", leadId);
      return customer.id as string;
    },
    ...mutate(qc, "Customer created from lead"),
  });
}

/** Turn a lead into a detailed enquiry (creating the customer if needed). */
export function useConvertLeadToEnquiry() {
  const qc = useQueryClient();
  const toCustomer = useConvertLeadToCustomer();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data: existing } = await supabase
        .from("enquiries")
        .select("id")
        .eq("lead_id", leadId)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) return existing.id as string;

      const customerId = await toCustomer.mutateAsync(leadId);
      const { data: lead, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();
      if (error) throw error;

      const nights =
        lead.travel_start && lead.travel_end
          ? Math.max(
              0,
              Math.round(
                (new Date(lead.travel_end).getTime() - new Date(lead.travel_start).getTime()) /
                  86400000,
              ),
            )
          : null;

      const { data: enquiry, error: eErr } = await supabase
        .from("enquiries")
        .insert({
          lead_id: leadId,
          customer_id: customerId,
          scope: lead.scope,
          destination_id: lead.destination_id,
          departure_date: lead.travel_start,
          return_date: lead.travel_end,
          nights,
          adults: lead.adults ?? 1,
          children: lead.children ?? 0,
          infants: lead.infants ?? 0,
          total_budget: lead.budget,
          currency: lead.currency ?? "INR",
          hotel_category: lead.hotel_category,
          meal_plan: lead.meal_preference,
          transport_type: lead.transport_preference,
          requirements: lead.special_requirements,
          status: "new",
          assigned_to: lead.assigned_to,
        } as never)
        .select("id")
        .single();
      if (eErr) throw eErr;
      await supabase
        .from("leads")
        .update({ status: "requirement_collected" } as never)
        .eq("id", leadId);
      return enquiry.id as string;
    },
    ...mutate(qc, "Enquiry created from lead"),
  });
}

/** Create a customer directly from an enquiry that has none yet. */
export function useConvertEnquiryToCustomer() {
  const qc = useQueryClient();
  const fromLead = useConvertLeadToCustomer();
  return useMutation({
    mutationFn: async (enquiryId: string) => {
      const { data: enquiry, error } = await supabase
        .from("enquiries")
        .select("id,customer_id,lead_id")
        .eq("id", enquiryId)
        .single();
      if (error) throw error;
      if (enquiry.customer_id) return enquiry.customer_id as string;
      if (!enquiry.lead_id) throw new Error("Add customer details on this enquiry first.");
      const customerId = await fromLead.mutateAsync(enquiry.lead_id);
      await supabase
        .from("enquiries")
        .update({ customer_id: customerId } as never)
        .eq("id", enquiryId);
      return customerId;
    },
    ...mutate(qc, "Customer linked to enquiry"),
  });
}

/** Build a quotation straight from an enquiry's requirements. */
export function useConvertEnquiryToQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enquiryId: string) => {
      const { data: enquiry, error } = await supabase
        .from("enquiries")
        .select("*, customers(full_name), destinations(name)")
        .eq("id", enquiryId)
        .single();
      if (error) throw error;

      const { data: quotation, error: qErr } = await supabase
        .from("quotations")
        .insert({
          enquiry_id: enquiryId,
          lead_id: enquiry.lead_id,
          customer_id: enquiry.customer_id,
          title: `${enquiry.destinations?.name ?? "Trip"} — ${enquiry.customers?.full_name ?? "Guest"}`,
          scope: enquiry.scope,
          destination_id: enquiry.destination_id,
          travel_start: enquiry.departure_date,
          travel_end: enquiry.return_date,
          adults: enquiry.adults ?? 1,
          children: enquiry.children ?? 0,
          infants: enquiry.infants ?? 0,
          currency: enquiry.currency ?? "INR",
          status: "draft",
          assigned_to: enquiry.assigned_to,
        } as never)
        .select("id")
        .single();
      if (qErr) throw qErr;
      await supabase
        .from("enquiries")
        .update({ status: "proposal_sent" } as never)
        .eq("id", enquiryId);
      return quotation.id as string;
    },
    ...mutate(qc, "Quotation started from enquiry"),
  });
}
