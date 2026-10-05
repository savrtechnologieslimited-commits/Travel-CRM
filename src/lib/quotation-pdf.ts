import { formatDate, formatMoney, titleize } from "@/lib/crm";
import { hotelDetailPairs, hotelOf } from "@/lib/hotel";
import { transportDetailPairs, transportOf } from "@/lib/transport";
import { activityDetailPairs, activityOf } from "@/lib/activity";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

/**
 * Opens a print-ready quotation document in a new window.
 * Users can save it as PDF or share the printout with the customer.
 */
export function printQuotation(opts: {
  quotation: AnyRec;
  items: AnyRec[];
  days: AnyRec[];
  agency?: AnyRec | null;
}) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const q: any = opts.quotation;
  const items = opts.items;
  const days = opts.days;
  const agency: any = opts.agency ?? {};
  const esc = (v: unknown) =>
    String(v ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
    );

  const hotelBlock = (it: any) => {
    const h = hotelOf(it);
    if (!h) return "";
    return `<br/><span class="muted">${hotelDetailPairs(h)
      .map(([label, value]) => `${esc(label)}: ${esc(value)}`)
      .join(" · ")}</span>`;
  };

  const transportBlock = (it: any) => {
    const t = transportOf(it);
    if (!t) return "";
    return `<br/><span class="muted">${transportDetailPairs(t)
      .map(([label, value]) => `${esc(label)}: ${esc(value)}`)
      .join(" · ")}</span>`;
  };

  const activityBlock = (it: any) => {
    const a = activityOf(it);
    if (!a) return "";
    return `<br/><span class="muted">${activityDetailPairs(a)
      .map(([label, value]) => `${esc(label)}: ${esc(value)}`)
      .join(" · ")}</span>`;
  };

  const itemRows = items
    .map(
      (it: any) => `<tr>
        <td>${esc(titleize(it.item_type))}</td>
        <td><strong>${esc(it.title)}</strong>${it.description ? `<br/><span class="muted">${esc(it.description)}</span>` : ""}${hotelBlock(it)}${transportBlock(it)}${activityBlock(it)}</td>
        <td>${esc(it.city ?? hotelOf(it)?.city ?? transportOf(it)?.pickup_location ?? activityOf(it)?.city ?? activityOf(it)?.location ?? "")}</td>
        <td class="num">${esc(it.quantity ?? 1)}</td>
        <td class="num">${esc(formatMoney(Number(it.sell_price ?? 0), q.currency))}</td>
      </tr>`,
    )
    .join("");

  const dayRows = days
    .map(
      (d: any) => `<div class="day">
        <p class="dayhead">Day ${esc(d.day_number)}${d.city ? ` · ${esc(d.city)}` : ""}${d.title ? ` — ${esc(d.title)}` : ""}</p>
        ${Array.isArray(d.activities) && d.activities.length ? `<ul>${d.activities.map((a: string) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
        <p class="muted">${[
          d.hotel && `Hotel: ${d.hotel}`,
          d.meals && `Meals: ${d.meals}`,
          d.transport && `Transport: ${d.transport}`,
        ]
          .filter(Boolean)
          .map(esc)
          .join(" · ")}</p>
      </div>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(q.code ?? "Quotation")} — ${esc(q.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; color: #14212b; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 28px 0 8px; border-bottom: 1px solid #d9e2e8; padding-bottom: 4px; }
  .muted { color: #607080; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #e6ecf0; vertical-align: top; }
  th { background: #f2f6f8; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 12px; margin-left: auto; width: 300px; }
  .totals td { border: none; padding: 4px 0; }
  .grand { font-weight: 700; border-top: 1px solid #14212b !important; }
  .day { margin-bottom: 12px; }
  .dayhead { font-weight: 600; margin: 0 0 4px; font-size: 13px; }
  ul { margin: 4px 0 4px 18px; padding: 0; font-size: 12.5px; }
  @media print { body { margin: 12mm; } }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>${esc(agency.name ?? "SAVR Travels")}</h1>
      <p class="muted">${[agency.address, agency.phone, agency.email, agency.gstin && `GSTIN: ${agency.gstin}`].filter(Boolean).map(esc).join(" · ")}</p>
    </div>
    <div class="muted" style="text-align:right">
      <p>Quotation No: <strong>${esc(q.code ?? "Not issued")}</strong> · v${esc(q.version ?? 1)}</p>
      <p>Date: ${esc(formatDate(q.created_at))}</p>
      <p>Valid until: ${esc(formatDate(q.valid_until))}</p>
    </div>
  </div>

  <h2>${esc(q.title)}</h2>
  <p class="muted">
    ${esc(q.customers?.full_name ?? "Customer")}${q.customers?.mobile ? ` · ${esc(q.customers.mobile)}` : ""}<br/>
    ${esc(titleize(q.scope))}${q.destinations?.name ? ` · ${esc(q.destinations.name)}, ${esc(q.destinations.country)}` : ""}<br/>
    Travel: ${esc(formatDate(q.travel_start))} → ${esc(formatDate(q.travel_end))} ·
    ${esc(q.adults ?? 0)} adults, ${esc(q.children ?? 0)} children, ${esc(q.infants ?? 0)} infants
  </p>

  <h2>Services &amp; costing</h2>
  <table>
    <thead><tr><th>Type</th><th>Service</th><th>City</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
    <tbody>${itemRows || `<tr><td colspan="5" class="muted">No services added.</td></tr>`}</tbody>
  </table>

  <table class="totals">
    <tr><td>Sub total</td><td class="num">${esc(formatMoney(Number(q.total_cost ?? 0) + Number(q.markup_amount ?? 0), q.currency))}</td></tr>
    <tr><td>Service charge</td><td class="num">${esc(formatMoney(Number(q.service_charge ?? 0), q.currency))}</td></tr>
    <tr><td>Discount</td><td class="num">- ${esc(formatMoney(Number(q.discount ?? 0), q.currency))}</td></tr>
    <tr><td>GST</td><td class="num">${esc(formatMoney(Number(q.tax_amount ?? 0), q.currency))}</td></tr>
    <tr class="grand"><td>Total payable</td><td class="num">${esc(formatMoney(Number(q.total_price ?? 0), q.currency))}</td></tr>
  </table>

  ${dayRows ? `<h2>Day-wise itinerary</h2>${dayRows}` : ""}

  ${q.terms || agency.terms ? `<h2>Terms &amp; conditions</h2><p class="muted" style="white-space:pre-wrap">${esc(q.terms || agency.terms)}</p>` : ""}
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
  return true;
}
