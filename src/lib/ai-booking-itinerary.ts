import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const buildItineraryFromBookingFn = createServerFn({ method: "POST" })
  .validator((input: { bookingId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { buildItineraryFromBooking } = await import("./ai-booking-itinerary.server");
    const { data: booking, error: bookingError } = await context.supabase
      .from("bookings")
      .select("*, destinations(name,country)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingError || !booking) throw new Error("Booking could not be loaded.");
    const { data: items, error: itemsError } = await context.supabase
      .from("booking_items")
      .select("*, hotel_bookings(*), transport_services(*), activity_services(*)")
      .eq("booking_id", data.bookingId)
      .order("created_at");
    if (itemsError) throw new Error("Booking services could not be loaded.");
    return buildItineraryFromBooking(data.bookingId, { booking: booking as Record<string, unknown>, items: (items ?? []) as Array<Record<string, unknown>> });
  });
