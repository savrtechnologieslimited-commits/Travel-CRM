import { formatDate, formatMoney, fulfilmentLabel, titleize } from "@/lib/crm";
import { hotelDetailPairs, hotelOf } from "@/lib/hotel";
import { transportDetailPairs, transportOf, transportRoute } from "@/lib/transport";
import { activityDetailPairs, activityOf, activityTitle } from "@/lib/activity";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRec = any;

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

function shell(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; color: #14212b; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid #d9e2e8; padding-bottom: 4px; }
  .muted { color: #607080; font-size: 12px; }
  .head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th, td { border-bottom: 1px solid #e5ecf1; padding: 7px 6px; text-align: left; vertical-align: top; }
  th { background: #f3f7f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 300px; }
  .totals td { border: none; padding: 4px 6px; }
  .grand { font-weight: 700; border-top: 1px solid #14212b !important; }
  .box { border: 1px solid #e5ecf1; border-radius: 8px; padding: 12px; font-size: 12px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media print { body { margin: 12mm; } .noprint { display: none; } }
</style></head><body>${body}
<script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body></html>`;
}

function open(html: string) {
  const w = window.open("", "_blank", "width=980,height=1200");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

/** Tax invoice for a confirmed booking, GST-ready for Indian agencies. */
export function printInvoice(opts: {
  booking: AnyRec;
  items: AnyRec[];
  payments: AnyRec[];
  agency?: AnyRec | null;
  gstRate?: number;
}) {
  const b = opts.booking;
  const agency: AnyRec = opts.agency ?? {};
  const cur = b.currency ?? "INR";
  const gstRate = opts.gstRate ?? 5;
  const gross = Number(b.total_price ?? 0);
  const taxable = gross / (1 + gstRate / 100);
  const tax = gross - taxable;
  const received = Number(b.amount_received ?? 0);
  const balance = gross - received;

  const rows = opts.items.length
    ? opts.items
        .map(
          (it) => `<tr>
      <td>${esc(titleize(it.item_type))}</td>
      <td><strong>${esc(it.title)}</strong>${it.description ? `<br/><span class="muted">${esc(it.description)}</span>` : ""}</td>
      <td>${esc(formatDate(it.start_date))}</td>
      <td class="num">${esc(formatMoney(Number(it.sell_price ?? 0), cur))}</td>
    </tr>`,
        )
        .join("")
    : `<tr><td colspan="3">Tour package services</td><td class="num">${esc(formatMoney(gross, cur))}</td></tr>`;

  const payRows = opts.payments
    .filter((p) => p.direction === "inbound")
    .map(
      (p) => `<tr><td>${esc(formatDate(p.paid_on))}</td><td>${esc(titleize(p.method))}</td>
      <td>${esc(p.reference ?? "—")}</td><td class="num">${esc(formatMoney(Number(p.amount ?? 0), cur))}</td></tr>`,
    )
    .join("");

  const html = shell(
    `Invoice ${b.invoice_code ?? ""}`,
    `
  <div class="head">
    <div>
      <h1>${esc(agency.name ?? "SAVR Travels")}</h1>
      <p class="muted">${esc(agency.address ?? "")}</p>
      <p class="muted">${[agency.phone, agency.email].filter(Boolean).map(esc).join(" · ")}</p>
      <p class="muted">GSTIN: ${esc(agency.gstin ?? "—")}</p>
    </div>
    <div style="text-align:right">
      <h1>TAX INVOICE</h1>
      <p class="muted">Invoice No: ${esc(b.invoice_code ?? "Not issued")}</p>
      <p class="muted">Booking No: ${esc(b.code ?? "—")}</p>
      <p class="muted">Date: ${esc(formatDate(b.invoice_date ?? b.booking_date))}</p>
      <p class="muted">Place of supply: ${esc(b.destinations?.name ?? "—")}</p>
    </div>
  </div>

  <div class="grid2" style="margin-top:18px">
    <div class="box">
      <strong>Bill to</strong><br/>
      ${esc(b.customers?.full_name ?? "Customer")}<br/>
      <span class="muted">${[b.customers?.mobile, b.customers?.email].filter(Boolean).map(esc).join(" · ")}</span>
    </div>
    <div class="box">
      <strong>Travel</strong><br/>
      ${esc(b.destinations?.name ?? "—")} · ${esc(titleize(b.scope))}<br/>
      <span class="muted">${esc(formatDate(b.travel_start))} → ${esc(formatDate(b.travel_end))} · ${esc(b.adults)} adults, ${esc(b.children)} children</span>
    </div>
  </div>

  <h2>Services</h2>
  <table><thead><tr><th>Type</th><th>Description</th><th>Date</th><th class="num">Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>

  <table class="totals">
    <tr><td>Taxable value</td><td class="num">${esc(formatMoney(taxable, cur))}</td></tr>
    <tr><td>GST @ ${gstRate}%</td><td class="num">${esc(formatMoney(tax, cur))}</td></tr>
    <tr class="grand"><td>Invoice total</td><td class="num">${esc(formatMoney(gross, cur))}</td></tr>
    <tr><td>Received</td><td class="num">${esc(formatMoney(received, cur))}</td></tr>
    <tr class="grand"><td>Balance due</td><td class="num">${esc(formatMoney(balance, cur))}</td></tr>
  </table>

  ${payRows ? `<h2>Payments received</h2><table><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead><tbody>${payRows}</tbody></table>` : ""}

  <h2>Terms</h2>
  <p class="muted">${esc(agency.terms ?? "Tax under GST on tour operator services. This is a computer generated invoice.")}</p>
  `,
  );
  open(html);
}

/** Money receipt for a single inbound payment. */
export function printReceipt(opts: {
  payment: AnyRec;
  booking?: AnyRec | null;
  agency?: AnyRec | null;
}) {
  const p = opts.payment;
  const b = opts.booking ?? {};
  const agency: AnyRec = opts.agency ?? {};
  const cur = p.currency ?? "INR";
  const html = shell(
    `Receipt ${p.receipt_code ?? ""}`,
    `
  <div class="head">
    <div>
      <h1>${esc(agency.name ?? "SAVR Travels")}</h1>
      <p class="muted">${esc(agency.address ?? "")}</p>
      <p class="muted">GSTIN: ${esc(agency.gstin ?? "—")}</p>
    </div>
    <div style="text-align:right">
      <h1>RECEIPT</h1>
      <p class="muted">Receipt No: ${esc(p.receipt_code ?? "Not issued")}</p>
      <p class="muted">Payment No: ${esc(p.code ?? "—")}</p>
      <p class="muted">Date: ${esc(formatDate(p.paid_on))}</p>
    </div>
  </div>
  <div class="box" style="margin-top:18px">
    Received with thanks from <strong>${esc(p.customers?.full_name ?? b.customers?.full_name ?? "Customer")}</strong>
    the sum of <strong>${esc(formatMoney(Number(p.amount ?? 0), cur))}</strong>
    by ${esc(titleize(p.method))}${p.reference ? ` (Ref ${esc(p.reference)})` : ""}
    towards booking ${esc(p.bookings?.code ?? b.code ?? "—")}.
  </div>
  <p class="muted" style="margin-top:24px">Authorised signatory</p>
  `,
  );
  open(html);
}

/** Traveller voucher pack for a booking's confirmed services. */
export function printVoucher(opts: { booking: AnyRec; items: AnyRec[]; agency?: AnyRec | null }) {
  const b = opts.booking;
  const agency: AnyRec = opts.agency ?? {};
  const cards = opts.items
    .map((it) => {
      const h = hotelOf(it);
      if (h) {
        return `<div class="box" style="margin-bottom:10px">
      <strong>Hotel — ${esc(h.hotel_name ?? it.title)}${h.city ? ` · ${esc(h.city)}` : ""}</strong>
      <table><tbody>${hotelDetailPairs(h)
        .map(
          ([label, value]) =>
            `<tr><td class="muted" style="width:130px">${esc(label)}</td><td>${esc(value)}</td></tr>`,
        )
        .join("")}
      <tr><td class="muted">Reference</td><td>${esc(h.confirmation_number ?? it.confirmation_number ?? "Pending")}</td></tr>
      <tr><td class="muted">Status</td><td>${esc(titleize(h.status ?? it.status ?? "pending"))}</td></tr>
      </tbody></table>
      ${h.address ? `<p class="muted">${esc(h.address)}</p>` : ""}
    </div>`;
      }
      const t = transportOf(it);
      if (t) {
        // Supplier and confirmation are printed once, in the fulfilment rows below.
        const pairs = transportDetailPairs(t).filter(
          ([label]) => label !== "Supplier" && label !== "Confirmation",
        );
        const partner = fulfilmentLabel(it.fulfilment_mode, t.suppliers ?? it.suppliers);
        return `<div class="box" style="margin-bottom:10px">
      <strong>Transport — ${esc(t.transport_type ?? it.title)}${transportRoute(t) ? ` · ${esc(transportRoute(t))}` : ""}</strong>
      <table><tbody>${pairs
        .map(
          ([label, value]) =>
            `<tr><td class="muted" style="width:130px">${esc(label)}</td><td>${esc(value)}</td></tr>`,
        )
        .join("")}
      <tr><td class="muted">Fulfilment</td><td>${esc(partner)}</td></tr>
      <tr><td class="muted">Confirmation</td><td>${esc(t.confirmation_number ?? it.confirmation_number ?? "Pending")}</td></tr>
      <tr><td class="muted">Status</td><td>${esc(titleize(t.status ?? it.status ?? "pending"))}</td></tr>
      </tbody></table>
      ${t.notes ? `<p class="muted">${esc(t.notes)}</p>` : ""}
    </div>`;
      }
      const a = activityOf(it);
      if (a) {
        // Supplier and confirmation are printed once, in the fulfilment rows below.
        const pairs = activityDetailPairs(a).filter(
          ([label]) => label !== "Supplier" && label !== "Confirmation",
        );
        const partner = fulfilmentLabel(it.fulfilment_mode, a.suppliers ?? it.suppliers);
        return `<div class="box" style="margin-bottom:10px">
      <strong>Activity — ${esc(activityTitle(a))}</strong>
      <table><tbody>${pairs
        .map(
          ([label, value]) =>
            `<tr><td class="muted" style="width:130px">${esc(label)}</td><td>${esc(value)}</td></tr>`,
        )
        .join("")}
      <tr><td class="muted">Fulfilment</td><td>${esc(partner)}</td></tr>
      <tr><td class="muted">Confirmation</td><td>${esc(a.confirmation_number ?? it.confirmation_number ?? "Pending")}</td></tr>
      <tr><td class="muted">Status</td><td>${esc(titleize(a.status ?? it.status ?? "pending"))}</td></tr>
      </tbody></table>
      ${a.notes ? `<p class="muted">${esc(a.notes)}</p>` : ""}
    </div>`;
      }
      return `<div class="box" style="margin-bottom:10px">
      <strong>${esc(titleize(it.item_type))} — ${esc(it.title)}</strong><br/>
      <span class="muted">${esc(formatDate(it.start_date))} → ${esc(formatDate(it.end_date))} · ${esc(it.suppliers?.name ?? "")}</span><br/>
      <span class="muted">Confirmation: ${esc(it.confirmation_number ?? "Pending")}</span>
      ${it.description ? `<p class="muted">${esc(it.description)}</p>` : ""}
    </div>`;
    })
    .join("");

  const html = shell(
    `Voucher ${b.code ?? ""}`,
    `
  <div class="head">
    <div><h1>${esc(agency.name ?? "SAVR Travels")}</h1><p class="muted">${esc(agency.phone ?? "")}</p></div>
    <div style="text-align:right"><h1>SERVICE VOUCHER</h1><p class="muted">Booking No: ${esc(b.code ?? "—")}</p></div>
  </div>
  <div class="box" style="margin:18px 0">
    <strong>${esc(b.customers?.full_name ?? "Guest")}</strong> · ${esc(b.adults)} adults, ${esc(b.children)} children<br/>
    <span class="muted">${esc(b.destinations?.name ?? "")} · ${esc(formatDate(b.travel_start))} → ${esc(formatDate(b.travel_end))}</span>
  </div>
  <h2>Confirmed services</h2>
  ${cards || '<p class="muted">No services added yet.</p>'}
  <p class="muted" style="margin-top:20px">24x7 assistance: ${esc(agency.phone ?? "—")}</p>
  `,
  );
  open(html);
}
