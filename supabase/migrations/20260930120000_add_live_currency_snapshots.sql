-- Preserve the entered amount/currency and a live-rate INR snapshot for financial records.
-- Existing foreign-currency history is intentionally left NULL rather than backfilled with today's rate.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS budget_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS budget_per_person_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_budget_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS total_cost_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_price_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.quotation_items
  ADD COLUMN IF NOT EXISTS cost_price_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS sell_price_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.booking_items
  ADD COLUMN IF NOT EXISTS cost_price_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS sell_price_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS total_cost_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_price_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS amount_received_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS amount_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS tax_amount_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_amount_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS amount_paid_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS amount_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.itinerary_cost_lines
  ADD COLUMN IF NOT EXISTS unit_cost_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_cost_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS price_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS starting_price_inr numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_updated_at timestamptz;
