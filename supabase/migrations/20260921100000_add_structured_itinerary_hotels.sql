ALTER TABLE public.itinerary_day_items
  ADD COLUMN IF NOT EXISTS hotel_address text,
  ADD COLUMN IF NOT EXISTS hotel_country text,
  ADD COLUMN IF NOT EXISTS star_category text,
  ADD COLUMN IF NOT EXISTS nights integer,
  ADD COLUMN IF NOT EXISTS room_type text,
  ADD COLUMN IF NOT EXISTS rooms integer,
  ADD COLUMN IF NOT EXISTS adults integer,
  ADD COLUMN IF NOT EXISTS children integer,
  ADD COLUMN IF NOT EXISTS extra_beds integer,
  ADD COLUMN IF NOT EXISTS meal_plan text,
  ADD COLUMN IF NOT EXISTS hotel_description text,
  ADD COLUMN IF NOT EXISTS customer_facing_info text,
  ADD COLUMN IF NOT EXISTS hotel_option_group text,
  ADD COLUMN IF NOT EXISTS hotel_option_label text,
  ADD COLUMN IF NOT EXISTS hotel_option_sequence integer;

ALTER TABLE public.itinerary_day_items
  ADD CONSTRAINT itinerary_day_items_hotel_nights_non_negative CHECK (nights IS NULL OR nights >= 0),
  ADD CONSTRAINT itinerary_day_items_hotel_rooms_positive CHECK (rooms IS NULL OR rooms > 0),
  ADD CONSTRAINT itinerary_day_items_hotel_adults_non_negative CHECK (adults IS NULL OR adults >= 0),
  ADD CONSTRAINT itinerary_day_items_hotel_children_non_negative CHECK (children IS NULL OR children >= 0),
  ADD CONSTRAINT itinerary_day_items_hotel_extra_beds_non_negative CHECK (extra_beds IS NULL OR extra_beds >= 0),
  ADD CONSTRAINT itinerary_day_items_hotel_option_sequence_non_negative CHECK (hotel_option_sequence IS NULL OR hotel_option_sequence >= 0),
  ADD CONSTRAINT itinerary_day_items_hotel_meal_plan_valid CHECK (meal_plan IS NULL OR meal_plan IN ('Room Only', 'Breakfast', 'MAP', 'AP', 'All Inclusive'));

CREATE INDEX IF NOT EXISTS itinerary_day_items_hotel_option_idx
  ON public.itinerary_day_items (itinerary_day_id, hotel_option_group, hotel_option_sequence);

CREATE INDEX IF NOT EXISTS itinerary_day_items_accommodation_idx
  ON public.itinerary_day_items (item_type, hotel_name, check_in, check_out);
