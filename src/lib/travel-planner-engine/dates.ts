const DAY = 86_400_000;
export const dateOnly = (iso: string): string => iso.slice(0, 10);
export const timeOnly = (iso: string): string | null => (iso.length >= 16 ? iso.slice(11, 16) : null);
export const diffDays = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
export const addDays = (d: string, n: number): string =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export function toMinutes(t?: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}
