import { dateOnly } from "./dates";
import type { TripRequest } from "./types";

export function inferDuration(text: string): { days: number | null; nights: number | null } {
  let m = /(\d+)\s*N\s*[\/& ,]?\s*(\d+)\s*D\b/i.exec(text);
  if (m) return { nights: Number(m[1]), days: Number(m[2]) };
  m = /(\d+)\s*D\s*[\/& ,]?\s*(\d+)\s*N\b/i.exec(text);
  if (m) return { days: Number(m[1]), nights: Number(m[2]) };
  const d = /(\d+)\s*days?\b/i.exec(text);
  const n = /(\d+)\s*nights?\b/i.exec(text);
  return { days: d ? Number(d[1]) : null, nights: n ? Number(n[1]) : null };
}

export function expectedDuration(req: TripRequest): { days: number | null; nights: number | null } {
  const r = req.requirements ?? {};
  let days = r.days ?? null;
  let nights = r.nights ?? null;
  if (days === null && nights === null) ({ days, nights } = inferDuration(req.request));
  if (days !== null && nights === null) nights = Math.max(days - 1, 0);
  if (nights !== null && days === null) days = nights + 1;
  return { days, nights };
}

export function resolveStartDate(req: TripRequest): string | null {
  if (req.requirements?.startDate) return req.requirements.startDate;
  const arrivals = (req.fixedServices?.transport ?? []).filter((t) => t.role === "arrival").map((t) => dateOnly(t.arrival)).sort();
  if (arrivals[0]) return arrivals[0];
  const hotels = (req.fixedServices?.hotels ?? []).map((h) => h.checkIn).sort();
  return hotels[0] ?? null;
}
