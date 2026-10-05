import type { ItineraryPresentationPreview } from "./itinerary-preview";
import { insertInlineItineraryDayPhotos } from "./itinerary-inline-day-photos";
import { sanitizeItineraryTermHtml } from "./itinerary-terms-rich-text";

export function buildItineraryPackageDocumentHtml(preview: ItineraryPresentationPreview): string {
  const esc = (value: unknown) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const photoCredit = (photo: ItineraryPresentationPreview["photos"][number]) => {
    const authors = photo.attribution?.map((author) => author.displayName).filter(Boolean).join(", ");
    if (photo.source === "GOOGLE_PLACES") return `Photo: ${photo.place_name || photo.caption || "Google Places"} · Google Maps${authors ? ` · ${authors}` : ""}`;
    return photo.caption || "";
  };
  const sectionHeading = (kicker: string, title: string, accent: string) => `<p class="section-kicker">${esc(kicker)}</p><h2 class="section-title">${esc(title)} <span>${esc(accent)}</span></h2>`;
  const detailsList = (details: string[] | undefined) => details?.length
    ? `<ul class="detail-list">${details.map((detail) => `<li>${esc(detail)}</li>`).join("")}</ul>`
    : "";
  const itemCard = (item: ItineraryPresentationPreview["days"][number]["items"][number], label: string, dayNumber?: number) => `
    <article class="summary-card"><span class="category-tag">${esc(label)}${dayNumber ? ` · DAY ${esc(dayNumber)}` : ""}</span>
      ${(item.photos ?? []).some((photo) => photo.url) ? `<div class="activity-photos">${(item.photos ?? []).filter((photo) => photo.url).map((photo) => `<img src="${esc(photo.url)}" alt="${esc(photo.alt_text ?? photo.caption ?? item.title)}" />`).join("")}</div>` : ""}
      <h3>${esc(item.title)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ""}${detailsList(item.details)}${item.image_credit ? `<small class="activity-photo-credit">Photo: ${esc(item.image_credit)} · Google Maps</small>` : ""}
    </article>`;
  const formatDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  };
  const heroPhoto = preview.branding.cover_image_url || preview.photos.find((photo) => photo.url)?.url || "";
  const tripDays = preview.days.length;
  const nights = preview.trip.start_date && preview.trip.end_date
    ? Math.max(0, Math.round((new Date(`${preview.trip.end_date}T00:00:00`).getTime() - new Date(`${preview.trip.start_date}T00:00:00`).getTime()) / 86400000))
    : Math.max(0, tripDays - 1);
  const daysHtml = preview.days.map((day) => `
    <article class="day-card">
      <div class="day-heading"><span class="day-chip">DAY ${esc(day.day_number)}</span><div><h3>${esc(day.title)}</h3>${day.date ? `<small>${esc(formatDate(day.date))}</small>` : ""}</div></div>
      <p class="day-description">${esc(day.description || "Itinerary details to be confirmed.")}</p>
      ${day.photos.filter((photo) => photo.url).map((photo) => `<figure style="margin:12px 0 0"><img src="${esc(photo.url ?? "")}" alt="${esc(photo.alt_text ?? photo.caption ?? `Day ${day.day_number} destination photo`)}" style="display:block;width:100%;max-height:260px;object-fit:cover;border-radius:8px" />${photoCredit(photo) ? `<figcaption class="photo-credit">${esc(photoCredit(photo))}</figcaption>` : ""}</figure>`).join("")}
      ${day.notes ? `<p class="day-notes">${esc(day.notes)}</p>` : ""}
    </article>`).join("");
  const editorContentWithDayPhotos = insertInlineItineraryDayPhotos(
    preview.editor_content_html ?? "",
    preview.days.flatMap((day) => day.photos.filter((photo) => photo.url).map((photo) => ({
      day_number: day.day_number,
      url: photo.url ?? "",
      alt_text: photo.alt_text,
      credit: photoCredit(photo),
    }))),
  );
  const generatedItinerary = editorContentWithDayPhotos.trim()
    ? `<section class="section"><p class="section-kicker">YOUR TRAVEL PLAN</p><h2 class="section-title">Itinerary Overview</h2><div class="editor-itinerary">${editorContentWithDayPhotos}</div></section>`
    : "";
  const itinerarySection = generatedItinerary || `<section class="section"><p class="section-kicker">ITINERARY</p><h2 class="section-title">Day-Wise Plan</h2>${daysHtml || `<p class="empty">The itinerary plan is being prepared.</p>`}</section>`;
  const entries = preview.days.flatMap((day) => day.items.map((item) => ({ day, item })));
  const accommodations = entries.filter(({ item }) => item.item_type === "ACCOMMODATION");
  const staysHtml = accommodations.map(({ day, item }) => {
    const image = item.image_url || item.photos?.find((photo) => photo.url)?.url || "";
    const bookingLabel = item.hotel_booking_scope === "overall"
      ? "OVERALL HOTEL BOOKING"
      : `${day.date ? formatDate(day.date) : `Day ${day.day_number}`} · ACCOMMODATION`;
    return `<article class="hotel-card">
      ${image ? `<img class="hotel-image" src="${esc(image)}" alt="${esc(item.title)}" />` : `<div class="hotel-image hotel-placeholder">${esc(item.title)}</div>`}
      <div class="hotel-content"><p class="eyebrow">${esc(bookingLabel)}</p><h3>${esc(item.title)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ""}${detailsList(item.details)}${item.image_credit ? `<small class="photo-credit">Photo: ${esc(item.image_credit)} · Google Maps</small>` : ""}</div>
    </article>`;
  }).join("");
  const activityTypes = new Set(["ACTIVITY", "SIGHTSEEING", "MEAL", "NOTE"]);
  const activityDays = preview.days.map((day) => {
    const cards = day.items.filter((item) => activityTypes.has(item.item_type ?? ""));
    if (!cards.length) return "";
    return `<article class="service-day"><div class="service-day-heading"><span class="day-chip">DAY ${esc(day.day_number)}</span><div><strong>${esc(day.title)}</strong><small>${esc(day.date ? formatDate(day.date) : "Date to be confirmed")}</small></div></div><div class="summary-grid">${cards.map((item) => itemCard(item, (item.item_type ?? "ACTIVITY").replaceAll("_", " "), day.day_number)).join("")}</div></article>`;
  }).filter(Boolean).join("");
  const transferTypes = new Set(["TRANSPORT", "EXTRA_TRANSPORT"]);
  const transferDays = preview.days.map((day) => {
    const cards = day.items.filter((item) => transferTypes.has(item.item_type ?? ""));
    if (!cards.length) return "";
    return `<article class="service-day"><div class="service-day-heading"><span class="day-chip">DAY ${esc(day.day_number)}</span><div><strong>${esc(day.title)}</strong><small>${esc(day.date ? formatDate(day.date) : "Date to be confirmed")}</small></div></div><div class="summary-grid">${cards.map((item) => itemCard(item, "TRANSFER", day.day_number)).join("")}</div></article>`;
  }).filter(Boolean).join("");
  const flightCards = entries.filter(({ item }) => item.item_type === "FLIGHT")
    .map(({ day, item }) => itemCard(item, "FLIGHT", day.day_number)).join("");
  const visaCards = entries.filter(({ item }) => item.item_type === "VISA")
    .map(({ day, item }) => itemCard(item, "VISA", day.day_number)).join("");
  const pricing = preview.pricing
    ? `<dl>
        <div><dt>Adults</dt><dd>${esc(preview.pricing.adults)}</dd></div><div><dt>Children</dt><dd>${esc(preview.pricing.children)}</dd></div>
        ${preview.pricing.pricing_mode === "total" ? `<div><dt>Total costing</dt><dd>${esc(preview.pricing.final_customer_price.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>` : ""}
        ${preview.pricing.pricing_mode === "per_person" && preview.pricing.per_person_price != null ? `<div><dt>Price per person</dt><dd>${esc(preview.pricing.per_person_price.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>` : ""}
        ${preview.pricing.adult_price == null ? "" : `<div><dt>Adult price</dt><dd>${esc(preview.pricing.adult_price.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>`}
        ${preview.pricing.child_price == null ? "" : `<div><dt>Child price</dt><dd>${esc(preview.pricing.child_price.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>`}
        ${preview.pricing.tax > 0 ? `<div><dt>GST included</dt><dd>${esc(preview.pricing.tax.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>` : ""}
        ${preview.pricing.pricing_mode === "per_person" ? `<div class="total"><dt>Total package price</dt><dd>${esc(preview.pricing.final_customer_price.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>` : ""}
      </dl>`
    : `<p class="quote-pending">Quote to be confirmed</p>`;
  const richText = (value: string) => sanitizeItineraryTermHtml(value);
  const simpleList = (values: string[]) => values.length ? `<ul>${values.map((value) => `<li>${richText(value)}</li>`).join("")}</ul>` : `<p class="muted">To be confirmed.</p>`;
  const termCards = [
    { title: "Notes", text: preview.notes },
    { title: "Cancellation Policy", text: preview.cancellation_info },
    { title: "Terms & Conditions", text: preview.terms_conditions },
  ].map(({ title, text }) => `<article class="terms-card"><h3>${esc(title)}</h3><div>${richText(text || "Please refer to your final booking confirmation.")}</div></article>`).join("");
  const tables = preview.customTables.map((table) => `<section class="section"><h2 class="subheading">${esc(table.title ?? "Additional details")}</h2><table><thead><tr>${(table.columns?.length ? table.columns : ["Item", "Value"]).map((column) => `<th>${esc(column)}</th>`).join("")}</tr></thead><tbody>${(table.rows ?? []).map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(preview.summary)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#fff;color:#10243b;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55}.document{max-width:980px;margin:0 auto;padding:0 24px 56px}.hero{height:390px;position:relative;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;background:linear-gradient(135deg,#0b3554,#087c91 60%,#102e50);background-size:cover;background-position:center;overflow:hidden}.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,20,35,.14),rgba(4,20,35,.76))}.hero-copy{position:relative;z-index:1;padding:24px}.hero-brand{margin:0 0 14px;text-transform:uppercase;letter-spacing:.24em;font-size:12px;font-weight:700}.hero h1{max-width:820px;margin:0 auto 25px;font-size:clamp(36px,5vw,62px);line-height:1.05;font-weight:800;text-shadow:0 2px 14px #0005}.duration-pill{display:inline-flex;align-items:center;border:1px solid #ffffffa6;border-radius:999px;padding:9px 20px;background:#fff1;font-weight:700}.facts{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #dfe8ef}.fact{min-height:106px;display:flex;align-items:center;gap:14px;padding:20px 26px;border-right:1px solid #dfe8ef}.fact:last-child{border-right:0}.fact-icon{display:grid;place-items:center;flex:0 0 48px;height:48px;border-radius:15px;background:#e4f7ff;color:#12aee8;font-size:22px}.fact strong,.fact small{display:block}.fact strong{font-size:17px;line-height:1.25}.fact small{margin-top:4px;color:#7f8ea0;font-size:12px}.section{margin:30px 18px 0}.section-kicker{display:flex;align-items:center;gap:10px;margin:0 0 10px;color:#04a9e7;font-weight:800;letter-spacing:.2em;font-size:11px;text-transform:uppercase}.section-kicker:before{content:"";height:2px;width:34px;background:#08b5ed}.section-title{margin:0 0 18px;color:#102b4b;font-size:32px;line-height:1.15}.section-title span{color:#04a9e7;border-bottom:3px solid #04a9e7}.day-card,.service-day,.summary-card,.hotel-card,.pricing-card,.list-card,.terms-card{border:1px solid #e2e8ef;border-radius:18px;background:#fff;box-shadow:0 5px 18px #152d4510}.day-card{padding:18px 22px;margin:12px 0}.day-heading,.service-day-heading{display:flex;align-items:center;gap:12px}.day-chip{display:inline-flex;align-items:center;justify-content:center;min-width:62px;padding:8px 10px;border-radius:12px;background:#112d4d;color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em}.day-heading h3{margin:0;color:#102b4b;font-size:20px}.day-heading small,.service-day-heading small{display:block;margin-top:3px;color:#8190a0}.day-description{margin:13px 0 0;white-space:pre-line;color:#40536a}.day-notes{margin:10px 0 0;color:#68798c}.service-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.hotel-card{overflow:hidden;display:grid;grid-template-columns:190px minmax(0,1fr);min-height:190px}.hotel-image{width:100%;height:100%;min-height:190px;object-fit:cover;background:#eaf2f6}.hotel-placeholder{display:grid;place-items:center;padding:18px;color:#71869a;text-align:center;background:linear-gradient(135deg,#e5f2f7,#dce9f0)}.hotel-content{padding:17px}.hotel-content h3,.summary-card h3{margin:5px 0 7px;color:#122e4d;font-size:18px}.hotel-content p,.summary-card p{margin:5px 0;color:#5f7184}.eyebrow,.category-tag{color:#00a8e3;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.detail-list{margin:9px 0 0;padding-left:18px;color:#56697d}.detail-list li{margin:3px 0}.service-day{padding:16px;margin:13px 0}.service-day-heading strong{display:block;color:#173552;font-size:16px}.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.summary-card{padding:15px;background:#fbfdff;box-shadow:none}.activity-photos{display:flex;gap:7px;margin:0 0 9px;overflow:hidden}.activity-photos img{width:calc(50% - 4px);height:112px;flex:0 0 calc(50% - 4px);border-radius:10px;object-fit:cover;background:#eaf2f6}.activity-photo-credit{display:block;margin-top:8px;color:#8593a1;font-size:10px}.category-tag{display:inline-block;padding:4px 7px;border-radius:7px;background:#e9f8fe}.pricing-card{padding:23px;background:#f9fcfe}.pricing-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:15px}.pricing-title h3{margin:0;font-size:21px}.pricing-title p{margin:3px 0 0;color:#718196}.pricing-card dl{display:grid;grid-template-columns:1fr auto;gap:11px;margin:0}.pricing-card dl div{display:contents}.pricing-card dt{color:#53677c}.pricing-card dd{margin:0;text-align:right;font-weight:600}.pricing-card .total dt,.pricing-card .total dd{padding-top:13px;border-top:1px solid #c9d7e1;color:#102b4b;font-size:20px;font-weight:800}.quote-pending{color:#8a6a28;font-weight:700}.lists{display:grid;grid-template-columns:1fr 1fr;gap:14px}.list-card{padding:18px}.list-card h3,.terms-card h3{margin:0 0 8px;color:#173552;font-size:17px}.list-card ul{margin:0;padding-left:20px;color:#53677c}.list-card li{margin:5px 0}.terms-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.terms-card{padding:17px;white-space:pre-line;color:#53677c}.terms-card p{margin:0}.muted{color:#8190a0}.section table{width:100%;border-collapse:collapse}.section th,.section td{padding:8px;border:1px solid #dce3e9;text-align:left}.section th{background:#f4f7fa}.footer{margin:36px 18px 0;padding-top:15px;border-top:1px solid #dfe8ef;text-align:center;color:#8190a0;font-size:11px}@media(max-width:680px){.document{padding:0 12px 32px}.hero{height:300px}.facts{grid-template-columns:1fr}.fact{min-height:78px;border-right:0;border-bottom:1px solid #e5ebf0;padding:14px 18px}.section{margin:24px 2px 0}.section-title{font-size:27px}.service-grid,.summary-grid,.lists,.terms-grid{grid-template-columns:1fr}.hotel-card{grid-template-columns:1fr}.hotel-image{height:190px;min-height:190px}.fact strong{font-size:15px}}@media print{body{background:#fff}.document{max-width:none;padding:0}.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}.day-card,.service-day,.summary-card,.hotel-card,.pricing-card,.list-card,.terms-card{break-inside:avoid;box-shadow:none}}
    </style><style>.editor-itinerary{padding:18px 22px;border:1px solid #e2e8ef;border-radius:18px;background:#fff;box-shadow:0 5px 18px #152d4510;color:#40536a}.editor-itinerary h1,.editor-itinerary h2,.editor-itinerary h3{color:#102b4b}.editor-itinerary img{max-width:100%;height:auto;border-radius:12px}.editor-itinerary a{color:#079ed4;text-decoration:underline}.photo-credit{display:block;margin-top:10px;color:#8593a1;font-size:10px}@media(max-width:680px){.editor-itinerary{padding:14px}}</style></head><body><main class="document">
    <header class="hero" ${heroPhoto ? `style="background-image:linear-gradient(180deg,rgba(4,20,35,.12),rgba(4,20,35,.76)),url('${esc(heroPhoto)}')"` : ""}><div class="hero-copy"><p class="hero-brand">${esc(preview.branding.company_name || "SAVR Travels")}</p><h1>${esc(preview.summary)}</h1><span class="duration-pill">${tripDays} Days${nights ? ` · ${nights} Nights` : ""}</span></div></header>
    <section class="facts"><div class="fact"><span class="fact-icon">♙</span><div><strong>${esc(preview.trip.guest_name || "Client name")}</strong><small>Client name</small></div></div><div class="fact"><span class="fact-icon">♧</span><div><strong>${esc(preview.trip.adults)} Adults${preview.trip.children ? ` · ${esc(preview.trip.children)} Children` : ""}</strong><small>Guests</small></div></div><div class="fact"><span class="fact-icon">▦</span><div><strong>${esc(preview.trip.start_date ? formatDate(preview.trip.start_date) : "Dates to be confirmed")}${preview.trip.end_date ? ` – ${esc(formatDate(preview.trip.end_date))}` : ""}</strong><small>Travel dates</small></div></div></section>
    ${itinerarySection}
    <section class="section">${sectionHeading("Accommodation", "Your", "Stays")}${staysHtml ? `<div class="service-grid">${staysHtml}</div>` : `<p class="empty">Stay details will be confirmed.</p>`}</section>
    <section class="section">${sectionHeading("Experiences", "Activities", "Day Wise")}${activityDays || `<p class="empty">No activities have been added yet.</p>`}</section>
    <section class="section">${sectionHeading("Getting around", "Transfers", "Day Wise")}${transferDays || `<p class="empty">No transfers have been added yet.</p>`}</section>
    <section class="section">${sectionHeading("Travel details", "Flight", "Details")}${flightCards ? `<div class="summary-grid">${flightCards}</div>` : `<p class="empty">No flight details added.</p>`}</section>
    <section class="section">${sectionHeading("Travel documents", "Visa", "Details")}${visaCards ? `<div class="summary-grid">${visaCards}</div>` : `<p class="empty">No visa details added.</p>`}</section>
    <section class="section"><p class="section-kicker">YOUR QUOTATION</p><h2 class="section-title">Pricing Details</h2><div class="pricing-card"><div class="pricing-title"><div><h3>${esc(preview.selectedPackage?.name ?? "Land Package")}</h3>${preview.selectedPackage?.description ? `<p>${esc(preview.selectedPackage.description)}</p>` : ""}</div><span class="category-tag">${preview.pricing?.pricing_mode === "per_person" ? "PER PERSON" : "TOTAL COSTING"}</span></div>${pricing}</div></section>
    <section class="section"><p class="section-kicker">PACKAGE DETAILS</p><h2 class="section-title">What's Included &amp; Excluded</h2><div class="lists"><article class="list-card"><h3>Included</h3>${simpleList(preview.inclusions)}</article><article class="list-card"><h3>Excluded</h3>${simpleList(preview.exclusions)}</article></div></section>
    <section class="section">${sectionHeading("Before you travel", "Terms", "& Conditions")}<div class="terms-grid">${termCards}</div></section>
    ${tables}
    ${preview.branding.signature_text ? `<div class="footer">${esc(preview.branding.signature_text)}</div>` : ""}
    ${preview.branding.footer_text ? `<div class="footer">${esc(preview.branding.footer_text)}</div>` : ""}
    </main></body></html>`;
 }