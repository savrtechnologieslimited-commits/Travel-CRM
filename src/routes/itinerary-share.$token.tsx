import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { lookupGoogleActivityPlacesFn, type GoogleActivityPhoto } from "@/lib/google-places-activities";
import { buildItineraryPresentation } from "@/lib/itinerary-preview";
import { buildItineraryPdfHtml } from "@/lib/itinerary-pdf";
import { getPublicItineraryShareByToken } from "@/lib/itinerary-share";
import { sanitizeItineraryTermHtml } from "@/lib/itinerary-terms-rich-text";

export const Route = createFileRoute("/itinerary-share/$token")({
  loader: async ({ params }) => {
    const share = await getPublicItineraryShareByToken(params.token);
    if (!share) {
      throw new Error("This itinerary link is invalid, expired, or has been revoked.");
    }
    return share;
  },
  component: ItinerarySharePage,
});

function ItinerarySharePage() {
  const share = Route.useLoaderData();
  const lookupGooglePlaces = useServerFn(lookupGoogleActivityPlacesFn);
  const [hotelPhotos, setHotelPhotos] = useState<Record<string, GoogleActivityPhoto>>({});
  const [activityPhotos, setActivityPhotos] = useState<Record<string, GoogleActivityPhoto>>({});
  const hotelPlaceIds = useMemo(() => [...new Set(share.itinerary.days.flatMap((day) => day.items.flatMap((item) => {
    if (item["item_type"] !== "ACCOMMODATION") return [];
    const metadata = item["metadata"];
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const placeId = metadata["google_hotel_place_id"];
    const customPhoto = metadata["custom_hotel_photo_url"];
    return typeof placeId === "string" && placeId && !(typeof customPhoto === "string" && customPhoto.trim()) ? [placeId] : [];
  })))], [share.itinerary.days]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(hotelPlaceIds.filter((placeId) => !hotelPhotos[placeId]).map(async (placeId) => {
      try {
        const result = await lookupGooglePlaces({ data: { action: "photo", placeId } });
        return result && !Array.isArray(result) && "photoUri" in result ? [placeId, result as GoogleActivityPhoto] as const : null;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (cancelled) return;
      const resolved = Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
      if (Object.keys(resolved).length) setHotelPhotos((current) => ({ ...current, ...resolved }));
    });
    return () => { cancelled = true; };
  }, [hotelPhotos, hotelPlaceIds, lookupGooglePlaces]);
  const activityPlaceIds = useMemo(() => [...new Set(share.itinerary.days.flatMap((day) => day.items.flatMap((item) => {
    if (item["item_type"] !== "ACTIVITY" && item["item_type"] !== "SIGHTSEEING") return [];
    if (Array.isArray(item["photos"]) && item["photos"].some((photo) => photo && typeof photo === "object" && typeof (photo as Record<string, unknown>)["url"] === "string")) return [];
    const metadata = item["metadata"];
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const placeId = metadata["google_place_id"];
    return typeof placeId === "string" && placeId ? [placeId] : [];
  })))], [share.itinerary.days]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(activityPlaceIds.filter((placeId) => !activityPhotos[placeId]).map(async (placeId) => {
      try {
        const result = await lookupGooglePlaces({ data: { action: "photo", placeId } });
        return result && !Array.isArray(result) && "photoUri" in result ? [placeId, result as GoogleActivityPhoto] as const : null;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (cancelled) return;
      const resolved = Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
      if (Object.keys(resolved).length) setActivityPhotos((current) => ({ ...current, ...resolved }));
    });
    return () => { cancelled = true; };
  }, [activityPhotos, activityPlaceIds, lookupGooglePlaces]);
  const sharePackageOptions = share.packageOptions.length > 0
    ? share.packageOptions.map((option) => option.id === share.selectedPackageId && share.customerPricing
      ? { ...option, pricing: { subtotal: share.customerPricing.total - share.customerPricing.tax, tax: share.customerPricing.tax, final_customer_price: share.customerPricing.total, per_person_price: share.customerPricing.perPerson, pricing_mode: share.customerPricing.mode, currency: share.customerPricing.currency } }
      : option)
    : share.customerPricing
      ? [{ id: share.selectedPackageId ?? "shared-quote", name: "Land Package", pricing: { subtotal: share.customerPricing.total - share.customerPricing.tax, tax: share.customerPricing.tax, final_customer_price: share.customerPricing.total, per_person_price: share.customerPricing.perPerson, pricing_mode: share.customerPricing.mode, currency: share.customerPricing.currency } }]
      : [];
  const sharePackageId = share.selectedPackageId ?? (share.customerPricing && sharePackageOptions[0] ? sharePackageOptions[0].id : null);
  const preview = buildItineraryPresentation({
    itinerary: {
      ...share.itinerary,
      days: share.itinerary.days.map((day) => ({
        ...day,
        items: day.items.map((item) => {
          const metadata = item["metadata"];
          const hotelMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
          const placeId = typeof hotelMetadata["google_hotel_place_id"] === "string" ? hotelMetadata["google_hotel_place_id"] : "";
          const customPhoto = typeof hotelMetadata["custom_hotel_photo_url"] === "string" ? hotelMetadata["custom_hotel_photo_url"] : "";
          const googlePhoto = placeId ? hotelPhotos[placeId] : undefined;
          const activityPlaceId = typeof hotelMetadata["google_place_id"] === "string" ? hotelMetadata["google_place_id"] : "";
          const activityGooglePhoto = activityPlaceId ? activityPhotos[activityPlaceId] : undefined;
          const itemPhotos = Array.isArray(item["photos"]) ? item["photos"] : [];
          return {
            ...item,
            image_url: customPhoto || googlePhoto?.photoUri,
            image_credit: item["item_type"] === "ACCOMMODATION"
              ? (!customPhoto ? googlePhoto?.authorAttributions.map((author) => author.displayName).filter(Boolean).join(", ") : undefined)
              : activityGooglePhoto?.authorAttributions.map((author) => author.displayName).filter(Boolean).join(", "),
            photos: itemPhotos.length > 0 || !activityGooglePhoto
              ? itemPhotos
              : [{ url: activityGooglePhoto.photoUri, caption: "Google Maps photo", alt_text: String(item["title"] ?? "Activity photo"), sequence: 1 }],
          };
        }),
      })),
    },
    template: share.template,
    packageOptions: sharePackageOptions,
    selectedPackageId: sharePackageId,
    branding: share.branding,
  });
  const packageTemplate = preview.template.id === "package";

  if (packageTemplate) {
    return <iframe
      title={`${preview.summary} customer itinerary`}
      srcDoc={buildItineraryPdfHtml(preview)}
      className="block min-h-screen w-full border-0 bg-white"
      onLoad={(event) => {
        const documentHeight = event.currentTarget.contentDocument?.documentElement.scrollHeight ?? 0;
        event.currentTarget.style.height = `${Math.max(documentHeight, window.innerHeight)}px`;
      }}
    />;
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">{packageTemplate ? "Travel itinerary" : preview.branding.company_name}</p>
          <h1 className="mt-2 text-3xl font-semibold">{preview.summary || share.itinerary.title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {share.itinerary.travel_start_date || "Dates pending"} to {share.itinerary.travel_end_date || "Dates pending"} · {preview.trip.adults} adults · {preview.trip.children} children
          </p>
          {preview.trip.guest_name && <p className="mt-1 text-sm font-medium text-slate-700">Prepared for {preview.trip.guest_name}</p>}
          {preview.selectedPackage && <p className="mt-1 text-sm text-slate-600">{preview.selectedPackage.name} package</p>}
        </div>
        <div className="space-y-6 p-6">
          {preview.days.map((day) => (
            <div key={`${day.day_number}-${day.title}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Day {day.day_number}</h2>
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{day.date || "Date pending"}</span>
              </div>
              <h3 className="text-base font-medium text-slate-800">{day.title}</h3>
              {day.description && <p className="mt-2 text-sm text-slate-600">{day.description}</p>}
              {day.photos.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3">{day.photos.map((photo, index) => photo.url ? <img key={`${day.day_number}-photo-${index}`} src={photo.url} alt={photo.alt_text || photo.caption || `Day ${day.day_number} photo`} className="h-40 w-full rounded-lg object-cover" /> : null)}</div>}
              {day.items.length > 0 ? (
                <div className="mt-4 space-y-3">
                    {day.items.filter((item) => !packageTemplate || item.item_type !== "ACCOMMODATION").map((item, itemIndex) => (
                    <div key={`${item.title}-${itemIndex}`} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="font-medium text-slate-800">{item.title}</p>
                      {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
                      {(item.photos ?? []).length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{(item.photos ?? []).map((photo, photoIndex) => photo.url ? <img key={`${item.title}-photo-${photoIndex}`} src={photo.url} alt={photo.alt_text || photo.caption || item.title} className="h-32 w-full rounded object-cover" /> : null)}</div>}
                      {(item.details ?? []).length > 0 && (
                        <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                          {(item.details ?? []).map((detail, detailIndex) => <li key={`${detail}-${detailIndex}`}>{detail}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No itinerary items for this day yet.</p>
              )}
            </div>
          ))}
          {packageTemplate && preview.days.some((day) => day.items.some((item) => item.item_type === "ACCOMMODATION")) && (
            <section className="border-t border-slate-200 pt-6">
              <h2 className="mb-3 text-xl font-semibold text-slate-900">Accommodation</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {preview.days.flatMap((day) => day.items.filter((item) => item.item_type === "ACCOMMODATION").map((item, index) => (
                  <article key={`${day.day_number}-${item.title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="font-semibold text-slate-900">{item.title}</h3>
                    {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
                    {(item.details ?? []).length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{(item.details ?? []).map((detail, detailIndex) => <li key={`${detail}-${detailIndex}`}>{detail}</li>)}</ul>}
                  </article>
                )))}
              </div>
            </section>
          )}
          {packageTemplate && (
            <section className="border-t border-slate-200 pt-6">
              <h2 className="mb-3 text-xl font-semibold text-slate-900">Pricing Details</h2>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-semibold">{preview.selectedPackage?.name ?? "Land Package"}</h3>
                {preview.selectedPackage?.description && <p className="mt-1 text-sm text-slate-600">{preview.selectedPackage.description}</p>}
                {preview.pricing ? <dl className="mt-3 space-y-2 text-sm">{preview.pricing.adult_price != null && <div className="flex justify-between"><dt>Price per adult</dt><dd>{preview.pricing.adult_price.toLocaleString("en-IN")} {preview.pricing.currency}</dd></div>}{preview.pricing.child_price != null && <div className="flex justify-between"><dt>Price per child</dt><dd>{preview.pricing.child_price.toLocaleString("en-IN")} {preview.pricing.currency}</dd></div>}{preview.pricing.per_person_price != null && <div className="flex justify-between"><dt>Price per person</dt><dd>{preview.pricing.per_person_price.toLocaleString("en-IN")} {preview.pricing.currency}</dd></div>}<div className="flex justify-between"><dt>Package subtotal</dt><dd>{preview.pricing.subtotal.toLocaleString("en-IN")} {preview.pricing.currency}</dd></div><div className="flex justify-between"><dt>GST</dt><dd>{preview.pricing.tax.toLocaleString("en-IN")} {preview.pricing.currency}</dd></div><div className="flex justify-between border-t border-slate-300 pt-2 font-semibold"><dt>Total package price</dt><dd>{preview.pricing.final_customer_price.toLocaleString("en-IN")} {preview.pricing.currency}</dd></div></dl> : <p className="mt-2 text-sm font-medium text-amber-800">Quote to be confirmed</p>}
              </div>
            </section>
          )}
          {packageTemplate && preview.notes && <section className="border-t border-slate-200 pt-6"><h2 className="font-semibold">Notes</h2><p className="mt-2 whitespace-pre-line text-sm text-slate-600">{preview.notes}</p></section>}
          <section className="grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2">
            {share.itinerary.inclusions.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="font-semibold">Inclusions</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {share.itinerary.inclusions.map((item, index) => <li key={`${item}-${index}`} dangerouslySetInnerHTML={{ __html: sanitizeItineraryTermHtml(item) }} />)}
                </ul>
              </div>
            )}
            {share.itinerary.exclusions.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="font-semibold">Exclusions</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {share.itinerary.exclusions.map((item, index) => <li key={`${item}-${index}`} dangerouslySetInnerHTML={{ __html: sanitizeItineraryTermHtml(item) }} />)}
                </ul>
              </div>
            )}
            {share.itinerary.cancellation_info.trim() && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="font-semibold">Cancellation</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-600" dangerouslySetInnerHTML={{ __html: sanitizeItineraryTermHtml(share.itinerary.cancellation_info) }} />
              </div>
            )}
            {share.itinerary.terms_conditions.trim() && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <h2 className="font-semibold">Terms and Conditions</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-600" dangerouslySetInnerHTML={{ __html: sanitizeItineraryTermHtml(share.itinerary.terms_conditions) }} />
              </div>
            )}
            {packageTemplate && preview.cancellation_info && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="font-semibold">Cancellation Policy</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-600" dangerouslySetInnerHTML={{ __html: sanitizeItineraryTermHtml(preview.cancellation_info) }} />
              </div>
            )}
          </section>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-5 text-center text-xs uppercase tracking-[0.18em] text-slate-500">
          {preview.branding.footer_text}
        </div>
      </div>
    </div>
  );
}
