import type { ItineraryPresentationPreview } from "./itinerary-preview";
import { buildItineraryPackageDocumentHtml } from "./itinerary-package-document";
import { sanitizeItineraryTermHtml } from "./itinerary-terms-rich-text";

function buildTravelPackagePdfHtml(preview: ItineraryPresentationPreview): string {
  const esc = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const list = (values: string[]) => values.length
    ? `<ul>${values.map((value) => `<li>${sanitizeItineraryTermHtml(value)}</li>`).join("")}</ul>`
    : `<p class="muted">To be confirmed.</p>`;
  const daySections = preview.days.map((day) => `<article class="day-card">
    <div class="day-heading"><span class="day-chip">DAY ${esc(day.day_number)}</span><div><h3>${esc(day.title)}</h3>${day.date ? `<small>${esc(day.date)}</small>` : ""}</div></div>
    ${day.description ? `<p class="day-description">${esc(day.description)}</p>` : `<p class="muted">Your day-by-day itinerary.</p>`}
    ${day.notes ? `<p class="day-notes">${esc(day.notes)}</p>` : ""}
  </article>`).join("");
  const stays = preview.days.flatMap((day) => day.items
    .filter((item) => item.item_type === "ACCOMMODATION")
    .map((item) => `<article class="stay">${item.hotel_booking_scope === "overall" ? `<p class="eyebrow">Overall hotel booking</p>` : ""}<h3>${esc(item.title)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ""}${item.details?.length ? `<ul>${item.details.map((detail) => `<li>${esc(detail)}</li>`).join("")}</ul>` : ""}</article>`))
    .join("");
  const pricing = preview.pricing
    ? `<dl>
        <div><dt>Adults</dt><dd>${esc(preview.pricing.adults)}</dd></div>
        <div><dt>Children</dt><dd>${esc(preview.pricing.children)}</dd></div>
        <div><dt>Package subtotal</dt><dd>${esc(preview.pricing.subtotal.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>
        ${preview.pricing.adult_price == null ? "" : `<div><dt>Price per adult</dt><dd>${esc(preview.pricing.adult_price.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>`}
        ${preview.pricing.child_price == null ? "" : `<div><dt>Price per child</dt><dd>${esc(preview.pricing.child_price.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>`}
        ${preview.pricing.per_person_price == null ? "" : `<div><dt>Price per person</dt><dd>${esc(preview.pricing.per_person_price.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>`}
        <div><dt>Taxes</dt><dd>${esc(preview.pricing.tax.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>
        <div class="total"><dt>Total package price</dt><dd>${esc(preview.pricing.final_customer_price.toLocaleString("en-IN"))} ${esc(preview.pricing.currency)}</dd></div>
      </dl>`
    : `<p class="quote-pending">Quote to be confirmed</p>`;
  const photos = preview.photos.filter((photo) => photo.url).slice(0, 3)
    .map((photo) => `<img src="${esc(photo.url)}" alt="${esc(photo.alt_text ?? photo.caption ?? preview.summary)}" />`).join("");
  const customTables = preview.customTables.map((table) => `<section class="section"><h2>${esc(table.title ?? "Additional details")}</h2><table><thead><tr>${(table.columns?.length ? table.columns : ["Item", "Value"]).map((column) => `<th>${esc(column)}</th>`).join("")}</tr></thead><tbody>${(table.rows ?? []).map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`).join("");
  const termSections = [
    preview.notes ? `<section class="section"><h2>Notes</h2><p class="preline">${esc(preview.notes)}</p></section>` : "",
    preview.cancellation_info ? `<section class="section"><h2>Cancellation Policy</h2><div class="preline">${sanitizeItineraryTermHtml(preview.cancellation_info)}</div></section>` : "",
    preview.terms_conditions ? `<section class="section"><h2>Terms &amp; Conditions</h2><div class="preline">${sanitizeItineraryTermHtml(preview.terms_conditions)}</div></section>` : "",
  ].join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(preview.summary)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#eef1f4;color:#1d2935;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55}.document{width:210mm;margin:18px auto;padding:17mm 16mm;background:#fff;box-shadow:0 12px 32px #13233318}.brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #dce3e9;padding-bottom:18px}.brand-name{font-size:22px;font-weight:700;letter-spacing:.03em}.brand-tag{margin-top:3px;color:#697785}.eyebrow{margin:0;color:#98763a;font-size:10px;font-weight:700;letter-spacing:.22em;text-transform:uppercase}.cover{padding:30px 0 24px}.cover h1{margin:5px 0 0;font-size:32px;line-height:1.15;color:#17364c}.subtitle{margin:8px 0 0;color:#667583;font-size:14px}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0 0}.fact{padding:10px 12px;background:#f4f6f7;border-left:3px solid #b18a49}.fact small{display:block;color:#687582;text-transform:uppercase;font-size:9px;letter-spacing:.1em}.fact strong{display:block;margin-top:3px;font-size:12px}.hero-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 22px}.hero-photos img{width:100%;height:125px;object-fit:cover;border-radius:5px}.section{margin-top:25px;break-inside:avoid}.section-title{display:flex;align-items:center;gap:10px;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #dce3e9;color:#17364c;font-size:18px}.section-title:before{content:"";width:4px;height:18px;background:#b18a49}.day{padding:2px 0 15px;margin:0 0 15px;border-bottom:1px solid #e5e9ed;break-inside:avoid}.day-head{display:flex;align-items:center;gap:11px}.day-number{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#17364c;color:#fff;font-weight:700}.day h3,.stay h3{margin:2px 0;color:#21394b;font-size:15px}.description{margin:9px 0 4px;white-space:pre-line}.activity{margin:9px 0 0;padding:10px 12px;background:#f6f7f8;border-radius:4px}.activity h4{margin:0;font-size:12px}.activity p,.stay p{margin:4px 0}.activity ul,.stay ul{margin:5px 0 0;padding-left:18px;color:#596774}.stay-list{display:grid;gap:9px}.stay{padding:12px 14px;border:1px solid #dce3e9;border-radius:5px;break-inside:avoid}.stay h3{font-size:14px}.pricing{padding:16px 18px;background:#f4f6f7;border:1px solid #dce3e9;border-radius:5px}.pricing h3{margin:0 0 12px;font-size:16px}.pricing dl{display:grid;grid-template-columns:1fr auto;gap:7px;margin:0}.pricing dl div{display:contents}.pricing dt{color:#596774}.pricing dd{margin:0;text-align:right}.pricing .total dt,.pricing .total dd{padding-top:9px;border-top:1px solid #b9c4cc;color:#17364c;font-weight:700;font-size:14px}.quote-pending{margin:0;color:#74613e;font-weight:700}.columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.list-panel{padding:14px;border-radius:5px;background:#f6f7f8}.list-panel h3{margin:0 0 6px;color:#17364c;font-size:14px}.list-panel ul{margin:0;padding-left:18px}.muted{color:#697785}.preline{white-space:pre-line;margin:0}.section table{width:100%;border-collapse:collapse}.section th,.section td{padding:7px;border:1px solid #dce3e9;text-align:left}.section th{background:#f4f6f7}.signature{margin-top:28px;padding-top:15px;border-top:1px solid #dce3e9;white-space:pre-line}.footer{margin-top:20px;padding-top:12px;border-top:1px solid #dce3e9;text-align:center;color:#697785;font-size:10px}@media print{body{background:white}.document{width:auto;margin:0;padding:12mm;box-shadow:none}.section{break-inside:auto}.day,.stay,.pricing,.list-panel{break-inside:avoid}.hero-photos img{height:100px}}
    </style></head><body><main class="document">
    <header class="brand"><div><div class="brand-name">${esc(preview.branding.company_name ?? "")}</div>${preview.branding.header_text ? `<div class="brand-tag">${esc(preview.branding.header_text)}</div>` : ""}</div><p class="eyebrow">Travel proposal</p></header>
    <section class="cover"><p class="eyebrow">Your itinerary</p><h1>${esc(preview.summary)}</h1><p class="subtitle">${preview.selectedPackage ? `${esc(preview.selectedPackage.name)} package` : "A tailor-made travel plan"}</p><div class="facts">
      ${preview.trip.guest_name ? `<div class="fact"><small>Prepared for</small><strong>${esc(preview.trip.guest_name)}</strong></div>` : ""}
      <div class="fact"><small>Travel dates</small><strong>${esc(preview.trip.start_date || "To be confirmed")}${preview.trip.end_date ? ` → ${esc(preview.trip.end_date)}` : ""}</strong></div>
      <div class="fact"><small>Travellers</small><strong>${esc(preview.trip.adults)} adults · ${esc(preview.trip.children)} children</strong></div>
      <div class="fact"><small>Duration</small><strong>${preview.days.length} days${preview.trip.start_date && preview.trip.end_date ? ` · ${Math.max(0, Math.round((new Date(`${preview.trip.end_date}T00:00:00`).getTime() - new Date(`${preview.trip.start_date}T00:00:00`).getTime()) / 86400000))} nights` : ""}</strong></div>
    </div></section>
    ${photos ? `<div class="hero-photos">${photos}</div>` : ""}
    <section class="section"><h2 class="section-title">Day-Wise Plan</h2>${daySections || `<p class="muted">Daily plans to be confirmed.</p>`}</section>
    ${stays ? `<section class="section"><h2 class="section-title">Accommodation</h2><div class="stay-list">${stays}</div></section>` : ""}
    <section class="section"><h2 class="section-title">Pricing Details</h2><div class="pricing"><h3>${esc(preview.selectedPackage?.name ?? "Land Package")}</h3>${preview.selectedPackage?.description ? `<p>${esc(preview.selectedPackage.description)}</p>` : ""}${pricing}</div></section>
    <section class="section"><h2 class="section-title">What's Included &amp; Excluded</h2><div class="columns"><div class="list-panel"><h3>Included</h3>${list(preview.inclusions)}</div><div class="list-panel"><h3>Excluded</h3>${list(preview.exclusions)}</div></div></section>
    ${termSections}${customTables}
    ${preview.branding.signature_text ? `<div class="signature">${esc(preview.branding.signature_text)}</div>` : ""}
    ${preview.branding.footer_text ? `<div class="footer">${esc(preview.branding.footer_text)}</div>` : ""}
    </main></body></html>`;
}

export function buildItineraryPdfHtml(preview: ItineraryPresentationPreview): string {
  if (preview.template.id === "package") return buildItineraryPackageDocumentHtml(preview);

  const esc = (value: unknown) =>
    String(value ?? "")
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

  const renderTableRows = (table: NonNullable<ItineraryPresentationPreview["customTables"]>[number]) => {
    const columns = table.columns?.length ? table.columns : ["Item", "Value"];
    const rows = table.rows?.length ? table.rows : [["", ""]];

    return `
      <section class="table-block">
        <h3>${esc(table.title ?? "Custom table")}</h3>
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${esc(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) =>
                  `<tr>${(row ?? []).map((cell) => `<td>${esc(cell ?? "")}</td>`).join("")}</tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>`;
  };

  const renderItem = (item: ItineraryPresentationPreview["days"][number]["items"][number]) => {
    const details = item.details ?? [];
    return `
      <div class="item-block">
        ${item.hotel_booking_scope === "overall" ? `<p class="eyebrow">Overall hotel booking</p>` : ""}
        <h4>${esc(item.title)}</h4>
        ${item.description ? `<p>${esc(item.description)}</p>` : ""}
        ${details.length ? `<ul>${details.map((detail) => `<li>${esc(detail)}</li>`).join("")}</ul>` : ""}
        ${(item.photos ?? []).length ? `<div class="photo-grid">${(item.photos ?? []).map((photo) => `<img src="${esc(photo.url ?? "")}" alt="${esc(photo.alt_text ?? photo.caption ?? item.title)}" />`).join("")}</div>` : ""}
      </div>`;
  };

  const renderPage = (page: ItineraryPresentationPreview["pages"][number]) => `
    <section class="page-section">
      <h2>${esc(page.title)}</h2>
      ${page.content.map((entry) => `<p>${esc(entry)}</p>`).join("")}
    </section>`;

  const images = preview.photos
    .filter((photo) => Boolean(photo.url))
    .slice(0, 3)
    .map(
      (photo) => `
        <figure class="photo-card">
          <img src="${esc(photo.url ?? "")}" alt="${esc(photo.alt_text ?? photo.caption ?? "Itinerary photo")}" />
          ${photo.caption ? `<figcaption>${esc(photo.caption)}</figcaption>` : ""}
        </figure>`,
    )
    .join("");

  const daySections = preview.days
    .map(
      (day) => `
        <section class="day-block">
          <div class="day-header">
            <div>
              <span class="eyebrow">Day ${esc(day.day_number)}</span>
              <h3>${esc(day.title)}</h3>
            </div>
            ${day.date ? `<span class="date">${esc(day.date)}</span>` : ""}
          </div>
          ${day.description ? `<p class="lead">${esc(day.description)}</p>` : ""}
          ${day.notes ? `<p class="note">${esc(day.notes)}</p>` : ""}
          ${day.items.some((item) => item.hotel_booking_scope !== "overall") ? day.items.filter((item) => item.hotel_booking_scope !== "overall").map((item) => renderItem(item)).join("") : '<p class="muted">No itinerary items for this day yet.</p>'}
          ${day.photos.filter((photo) => photo.url).map((photo) => `<figure class="day-photo"><img src="${esc(photo.url ?? "")}" alt="${esc(photo.alt_text ?? photo.caption ?? "Day photo")}" />${photoCredit(photo) ? `<figcaption class="photo-credit">${esc(photoCredit(photo))}</figcaption>` : ""}</figure>`).join("")}
        </section>`,
    )
    .join("");

  const overallHotels = preview.days.flatMap((day) =>
    day.items.filter((item) => item.hotel_booking_scope === "overall"),
  );
  const overallHotelSection = overallHotels.length
    ? `<section class="section"><h2>Overall hotel booking</h2>${overallHotels.map((item) => renderItem(item)).join("")}</section>`
    : "";

  const pricingBlock = preview.pricing
    ? `
      <section class="pricing-block">
        <h3>Pricing</h3>
        <dl>
          <div><dt>Adults</dt><dd>${esc(preview.pricing.adults)}</dd></div>
          <div><dt>Children</dt><dd>${esc(preview.pricing.children)}</dd></div>
          <div><dt>Package subtotal</dt><dd>${esc(preview.pricing.subtotal)} ${esc(preview.pricing.currency)}</dd></div>
          ${preview.pricing.adult_price == null ? "" : `<div><dt>Adult price</dt><dd>${esc(preview.pricing.adult_price)} ${esc(preview.pricing.currency)}</dd></div>`}
          ${preview.pricing.child_price == null ? "" : `<div><dt>Child price</dt><dd>${esc(preview.pricing.child_price)} ${esc(preview.pricing.currency)}</dd></div>`}
          ${preview.pricing.per_person_price == null ? "" : `<div><dt>Price per person</dt><dd>${esc(preview.pricing.per_person_price)} ${esc(preview.pricing.currency)}</dd></div>`}
          <div><dt>Tax</dt><dd>${esc(preview.pricing.tax)} ${esc(preview.pricing.currency)}</dd></div>
          <div class="grand"><dt>Final customer price</dt><dd>${esc(preview.pricing.final_customer_price)} ${esc(preview.pricing.currency)}</dd></div>
        </dl>
      </section>`
    : "";

  const footer = preview.branding.footer_text ? `<footer>${esc(preview.branding.footer_text)}</footer>` : "";
  const signature = preview.branding.signature_text ? `<section class="signature"><p>${esc(preview.branding.signature_text)}</p></section>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${esc(preview.summary)}</title>
    <style>
      :root {
        --paper: #ffffff;
        --ink: #17202a;
        --muted: #586775;
        --panel: #f4f6f8;
        --line: #dfe6eb;
        --accent: #1f3a5f;
      }
      * { box-sizing: border-box; }
      body {
        padding: 0;
        background: #f3f5f7;
        color: var(--ink);
        font-family: Arial, Helvetica, sans-serif;
      }
      .page {
        width: 210mm;
        min-height: 297mm;
        padding: 14mm 16mm;
        background: var(--paper);
        box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 18px;
      }
      .brand h1 { font-size: 30px; }
      .brand p { padding-top: 6px; color: var(--muted); font-size: 12px; }
      .meta { font-size: 12px; color: var(--muted); text-align: right; }
      .hero { display: flex; justify-content: space-between; align-items: end; gap: 18px; }
      .hero h2 { font-size: 26px; }
      .hero .package { color: var(--muted); font-size: 12px; }
      .photo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding: 12px 0; }
      .photo-grid img, .photo-card img { width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--line); }
      .section { padding-top: 24px; }
      .section h3 { padding-bottom: 10px; font-size: 18px; }
      .grid { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 24px; }
      .item-block { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 12px; }
      .item-block h4 { padding-bottom: 6px; font-size: 16px; }
      .item-block p { padding-bottom: 6px; color: var(--muted); }
      .item-block ul { padding-left: 18px; color: var(--muted); }
      .table-block, .pricing-block, .page-section { padding-top: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid var(--line); padding: 8px; text-align: left; font-size: 12px; vertical-align: top; }
      th { background: #eef3f7; }
      .pricing-block dl { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
      .pricing-block dl div { display: contents; }
      .pricing-block dt { font-weight: 700; }
      .pricing-block dd { text-align: right; }
      .grand dt, .grand dd { font-weight: 700; }
      .note { color: var(--muted); font-style: italic; }
      .eyebrow { display: inline-block; text-transform: uppercase; letter-spacing: 0.12em; font-size: 10px; color: var(--muted); }
      .day-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
      .day-header h3 { padding-top: 4px; font-size: 20px; }
      .date { color: var(--muted); font-size: 12px; }
      .lead { color: var(--muted); }
      .muted { color: var(--muted); }
      .signature { padding-top: 36px; border-top: 1px solid var(--line); white-space: pre-line; }
      footer { padding-top: 28px; border-top: 1px solid var(--line); text-align: center; font-size: 11px; color: var(--muted); }
      @media print { body { background: white; } .page { box-shadow: none; width: auto; min-height: auto; } }
    </style>
  </head>
  <body>
    <article class="page">
      <header class="topbar">
        <div class="brand">
          ${preview.branding.company_name ? `<h1>${esc(preview.branding.company_name)}</h1>` : ""}
          ${preview.branding.header_text ? `<p>${esc(preview.branding.header_text)}</p>` : ""}
        </div>
        <div class="meta">
          ${preview.summary ? `<div>${esc(preview.summary)}</div>` : ""}
          ${preview.days.length ? `<div>${esc(preview.days[0]?.date ?? "")}${preview.days.at(-1)?.date ? ` → ${esc(preview.days.at(-1)?.date)}` : ""}</div>` : ""}
        </div>
      </header>

      <section class="hero">
        <div>
          <h2>${esc(preview.summary)}</h2>
          ${preview.selectedPackage ? `<div class="package">Selected package: ${esc(preview.selectedPackage.name)}</div>` : ""}
        </div>
        <div class="meta">
          ${preview.pricing ? `<div>Final customer price: ${esc(preview.pricing.final_customer_price)} ${esc(preview.pricing.currency)}</div>` : ""}
        </div>
      </section>

      ${images ? `<section class="section"><div class="photo-grid">${images}</div></section>` : ""}

      ${preview.pages.length ? preview.pages.map(renderPage).join("") : ""}

      ${preview.pricing ? `<section class="section">${pricingBlock}</section>` : ""}
      ${overallHotelSection}

      <section class="section">
        <div class="grid">
          <div>${daySections}</div>
          <aside>
            ${preview.customTables.length ? preview.customTables.map(renderTableRows).join("") : ""}
          </aside>
        </div>
      </section>

      ${preview.branding.signature_text ? signature : ""}
      ${footer}
    </article>
  </body>
</html>`;
}
