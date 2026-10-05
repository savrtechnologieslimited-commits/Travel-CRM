import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("itinerary persistence contract", () => {
  const itineraryLibraryMigration = readFileSync(join(import.meta.dir, "../../supabase/migrations/20260920120000_create_itinerary_library.sql"), "utf8");
  const itineraryDraftsMigration = readFileSync(join(import.meta.dir, "../../supabase/migrations/20260928120000_create_itinerary_drafts.sql"), "utf8");
  const migration = readFileSync(join(import.meta.dir, "../../supabase/migrations/20260920170000_complete_itinerary_content_persistence.sql"), "utf8");
  const hotelMigration = readFileSync(join(import.meta.dir, "../../supabase/migrations/20260921100000_add_structured_itinerary_hotels.sql"), "utf8");
  const task20Migration = readFileSync(join(import.meta.dir, "../../supabase/migrations/20260921110000_add_structured_itinerary_flights_visa_transport.sql"), "utf8");
  const activityPhotoLibraryMigration = readFileSync(join(import.meta.dir, "../../supabase/migrations/20260928130000_create_activity_photo_library.sql"), "utf8");
  const termsConditionsMigration = readFileSync(join(import.meta.dir, "../../supabase/migrations/20260929120000_add_itinerary_terms_conditions.sql"), "utf8");
  const itineraryGoogleImagesMigration = readFileSync(join(import.meta.dir, "../../supabase/migrations/20260929140000_add_itinerary_google_images.sql"), "utf8");
  const itineraryCostRepairMigration = readFileSync(join(import.meta.dir, "../../supabase/migrations/20260929150000_repair_itinerary_costing_and_packages.sql"), "utf8");

  test("can be rerun after a partial application and refreshes the API schema cache", () => {
    expect(itineraryLibraryMigration).toContain("ADD COLUMN IF NOT EXISTS destination_id uuid");
    expect(itineraryLibraryMigration).toContain('DROP POLICY IF EXISTS "staff select itineraries"');
    expect(itineraryLibraryMigration).toContain("NOTIFY pgrst, 'reload schema'");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS itineraries_travel_dates_valid");
    expect(migration).toContain('DROP POLICY IF EXISTS "staff select itinerary day items"');
    expect(migration).toContain("DROP TRIGGER IF EXISTS set_itinerary_day_items_updated_at");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });

  test("stores partial itinerary drafts privately per authenticated staff user", () => {
    expect(itineraryDraftsMigration).toContain("CREATE TABLE IF NOT EXISTS public.itinerary_drafts");
    expect(itineraryDraftsMigration).toContain("draft_data jsonb NOT NULL");
    expect(itineraryDraftsMigration).toContain("user_id = auth.uid()");
    expect(itineraryDraftsMigration).toContain("NOTIFY pgrst, 'reload schema'");
  });

  test("defines the scoped photo persistence model and cross-itinerary guard", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.itinerary_photos");
    expect(migration).toContain("day_id uuid REFERENCES public.itinerary_days");
    expect(migration).toContain("day_item_id uuid REFERENCES public.itinerary_day_items");
    expect(migration).toContain("validate_itinerary_photo_scope");
    expect(migration).toContain("Photo day must belong to the same itinerary");
    expect(migration).toContain("Photo item must belong to the same itinerary");
  });

  test("defines staff access and manager deletion policies", () => {
    expect(migration).toContain('CREATE POLICY "staff select itinerary photos"');
    expect(migration).toContain('CREATE POLICY "staff insert itinerary photos"');
    expect(migration).toContain('CREATE POLICY "staff update itinerary photos"');
    expect(migration).toContain('CREATE POLICY "manager delete itinerary photos"');
    expect(migration).toContain("ALTER TABLE public.itinerary_photos ENABLE ROW LEVEL SECURITY");
  });

  test("stores reusable place-keyed activity photos in private storage without breaking legacy URLs", () => {
    expect(activityPhotoLibraryMigration).toContain("CREATE TABLE IF NOT EXISTS public.activity_photo_library");
    expect(activityPhotoLibraryMigration).toContain("google_place_id text NOT NULL");
    expect(activityPhotoLibraryMigration).toContain("storage_path text NOT NULL UNIQUE");
    expect(activityPhotoLibraryMigration).toContain("caption text");
    expect(activityPhotoLibraryMigration).toContain("alt_text text");
    expect(activityPhotoLibraryMigration).toContain("display_order integer NOT NULL");
    expect(activityPhotoLibraryMigration).toContain("ALTER COLUMN url DROP NOT NULL");
    expect(activityPhotoLibraryMigration).toContain("itinerary_photos_url_or_storage_path_check");
    expect(activityPhotoLibraryMigration).toContain("bucket_id = 'itineraries'");
    expect(activityPhotoLibraryMigration).toContain("name LIKE 'activity-photo-library/%'");
    expect(activityPhotoLibraryMigration).toContain("private.is_staff(auth.uid())");
  });

  test("reuses itinerary photos for day images and defines a separate Google image cache", () => {
    expect(itineraryGoogleImagesMigration).toContain("ADD COLUMN IF NOT EXISTS selection_type text NOT NULL DEFAULT 'MANUAL'");
    expect(itineraryGoogleImagesMigration).toContain("ADD COLUMN IF NOT EXISTS google_photo_reference text");
    expect(itineraryGoogleImagesMigration).toContain("ADD COLUMN IF NOT EXISTS attribution jsonb");
    expect(itineraryGoogleImagesMigration).toContain("itinerary-place-images/%");
    expect(itineraryGoogleImagesMigration).toContain("CREATE TABLE IF NOT EXISTS public.itinerary_place_image_cache");
    expect(itineraryGoogleImagesMigration).toContain("normalized_query text PRIMARY KEY");
    expect(itineraryGoogleImagesMigration).toContain("private.is_staff(auth.uid())");
  });

  test("persists itinerary content metadata on the itinerary record", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS inclusions jsonb");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS exclusions jsonb");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS cancellation_info text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS custom_tables jsonb");
    expect(termsConditionsMigration).toContain("ADD COLUMN IF NOT EXISTS terms_conditions text NOT NULL DEFAULT ''");
    expect(termsConditionsMigration).toContain("NOTIFY pgrst, 'reload schema'");
  });

  test("extends day items for structured hotels without creating hotel bookings", () => {
    expect(hotelMigration).toContain("ADD COLUMN IF NOT EXISTS hotel_address text");
    expect(hotelMigration).toContain("ADD COLUMN IF NOT EXISTS star_category text");
    expect(hotelMigration).toContain("ADD COLUMN IF NOT EXISTS nights integer");
    expect(hotelMigration).toContain("ADD COLUMN IF NOT EXISTS rooms integer");
    expect(hotelMigration).toContain("ADD COLUMN IF NOT EXISTS meal_plan text");
    expect(hotelMigration).toContain("ADD COLUMN IF NOT EXISTS hotel_option_group text");
    expect(hotelMigration).toContain("itinerary_day_items_hotel_option_idx");
    expect(hotelMigration).not.toContain("CREATE TABLE public.hotel_bookings");
  });

  test("extends existing day items for flights, visa, and planned transport", () => {
    expect(task20Migration).toContain("'FLIGHT'");
    expect(task20Migration).toContain("'VISA'");
    expect(task20Migration).toContain("'EXTRA_TRANSPORT'");
    expect(task20Migration).toContain("ADD COLUMN IF NOT EXISTS flight_airline text");
    expect(task20Migration).toContain("ADD COLUMN IF NOT EXISTS visa_country text");
    expect(task20Migration).toContain("ADD COLUMN IF NOT EXISTS extra_transport_type text");
    expect(task20Migration).toContain("itinerary_day_items_flight_date_idx");
    expect(task20Migration).toContain("itinerary_day_items_visa_country_idx");
    expect(task20Migration).toContain("itinerary_day_items_extra_transport_date_idx");
    expect(task20Migration).not.toContain("CREATE TABLE public.transport_services");
  });

  test("repairs missing itinerary costing tables before adding package references", () => {
    expect(itineraryCostRepairMigration).toContain("CREATE TABLE IF NOT EXISTS public.itinerary_cost_lines");
    expect(itineraryCostRepairMigration).toContain("ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.itinerary_package_options(id)");
    expect(itineraryCostRepairMigration).toContain("DROP POLICY IF EXISTS \"staff select itinerary cost lines\"");
    expect(itineraryCostRepairMigration).toContain("itineraries_customer_quotes_object_check");
    expect(itineraryCostRepairMigration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
