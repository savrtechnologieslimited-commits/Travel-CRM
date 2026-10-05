import { supabase } from "@/integrations/supabase/client";

export type ActivityLibraryPhoto = {
  id: string;
  google_place_id: string;
  place_name: string;
  place_address: string;
  storage_path: string;
  caption: string | null;
  alt_text: string | null;
  display_order: number;
  display_url?: string;
};

const BUCKET = "itineraries";
const PREFIX = "activity-photo-library";
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

function safePlaceId(value: string) {
  const id = value.trim().replace(/^places\//, "");
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(id)) throw new Error("The Google Place ID is invalid.");
  return id;
}

function imageExtension(file: File) {
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
  const extension = extensions[file.type];
  if (!extension) throw new Error("Upload a JPEG, PNG, WebP, or AVIF photo.");
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) throw new Error("Photos must be smaller than 15 MB.");
  return extension;
}

export async function listActivityLibraryPhotos(placeId: string): Promise<ActivityLibraryPhoto[]> {
  const normalizedId = safePlaceId(placeId);
  const { data, error } = await supabase.from("activity_photo_library")
    .select("id,google_place_id,place_name,place_address,storage_path,caption,alt_text,display_order")
    .eq("google_place_id", normalizedId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (photo) => {
    const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(photo.storage_path, 3600);
    if (signedError) throw signedError;
    return { ...photo, display_url: signed.signedUrl };
  }));
}

export async function addActivityLibraryPhoto(input: {
  placeId: string;
  placeName: string;
  placeAddress: string;
  file: File;
}) {
  const placeId = safePlaceId(input.placeId);
  if (!input.placeName.trim() || !input.placeAddress.trim()) throw new Error("The matched activity must include a place name and address before adding photos.");
  const extension = imageExtension(input.file);
  const { count, error: countError } = await supabase.from("activity_photo_library")
    .select("id", { count: "exact", head: true }).eq("google_place_id", placeId);
  if (countError) throw countError;
  const path = `${PREFIX}/${placeId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data: userResult } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("activity_photo_library").insert({
    google_place_id: placeId,
    place_name: input.placeName.trim(),
    place_address: input.placeAddress.trim(),
    storage_path: path,
    display_order: (count ?? 0) + 1,
    created_by: userResult.user?.id ?? null,
  }).select("id,google_place_id,place_name,place_address,storage_path,caption,alt_text,display_order").single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (signedError) throw signedError;
  return { ...data, display_url: signed.signedUrl };
}

export async function replaceActivityLibraryPhoto(photo: ActivityLibraryPhoto, file: File) {
  const extension = imageExtension(file);
  const path = `${PREFIX}/${safePlaceId(photo.google_place_id)}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from("activity_photo_library").update({ storage_path: path }).eq("id", photo.id);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (signedError) throw signedError;
  return { ...photo, storage_path: path, display_url: signed.signedUrl };
}

export async function updateActivityLibraryPhoto(photo: ActivityLibraryPhoto) {
  const { error } = await supabase.from("activity_photo_library").update({
    caption: photo.caption,
    alt_text: photo.alt_text,
    display_order: photo.display_order,
    place_name: photo.place_name,
    place_address: photo.place_address,
  }).eq("id", photo.id);
  if (error) throw error;
}

export async function deleteActivityLibraryPhoto(photo: ActivityLibraryPhoto) {
  const { error: rowError } = await supabase.from("activity_photo_library").delete().eq("id", photo.id);
  if (rowError) throw rowError;
  const { error } = await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  if (error) throw error;
}

export async function reorderActivityLibraryPhotos(photos: ActivityLibraryPhoto[]) {
  for (const [index, photo] of photos.entries()) {
    const { error } = await supabase.from("activity_photo_library").update({ display_order: index + 1 }).eq("id", photo.id);
    if (error) throw error;
  }
}

export async function createItineraryPhotoDisplayUrl(storagePath: string) {
  if (!storagePath.startsWith(`${PREFIX}/`) && !storagePath.startsWith("itinerary-place-images/")) {
    throw new Error("The itinerary photo storage path is invalid.");
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}