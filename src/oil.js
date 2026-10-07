import { todayISO } from "./formatters";

const DAY = 86400000;
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);

// Oil change status from the log (newest first or any order) and the interval in days
export function oilStatus(changes, interval) {
  const sorted = [...changes].sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sorted[0];
  if (!last) return { has: false, count: 0 };
  const today = todayISO();
  const since = Math.max(0, daysBetween(last.date, today));
  const dueDate = addDays(last.date, interval);
  const left = interval - since;
  const gaps = sorted.slice(0, -1).map((c, i) => daysBetween(sorted[i + 1].date, c.date));
  const avg = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;
  return { has: true, count: sorted.length, last, since, dueDate, left, due: left <= 0, avg, sorted, interval };
}
