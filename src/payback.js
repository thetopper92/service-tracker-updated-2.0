import { MONTHS } from "./data";
import { todayISO } from "./formatters";

const ym = (iso) => iso.slice(0, 7);
const addMonths = (key, n) => {
  let [y, m] = key.split("-").map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
};
const monthsBetween = (a, b) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};
export const monthLabel = (key) => `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;

// How long until the money put into the business comes back, based on profit so far.
export function computePayback(transactions, assets, settings) {
  const equipment = settings.investIncludeEquip ? assets.reduce((s, a) => s + Number(a.cost || 0), 0) : 0;
  const base = Number(settings.investAmount) || 0;
  const invest = base + equipment;

  const dates = [...transactions.map((t) => t.date), ...assets.map((a) => a.purchase_date)].sort();
  const start = settings.investDate || dates[0] || todayISO();
  const startKey = ym(start);
  const nowKey = ym(todayISO());

  const byMonth = {};
  let recovered = 0;
  transactions.forEach((t) => {
    if (t.date < start) return;
    const v = t.type === "income" ? t.amount : -t.amount;
    byMonth[ym(t.date)] = (byMonth[ym(t.date)] || 0) + v;
    recovered += v;
  });

  const elapsed = Math.max(1, monthsBetween(startKey, nowKey) + 1);
  const avgMonthly = recovered / elapsed;
  const remaining = invest - recovered;
  const roi = invest > 0 ? (recovered / invest) * 100 : 0;

  // actual cumulative line
  const data = [];
  let cum = 0;
  let paidBackKey = null;
  for (let i = 0; i < elapsed; i++) {
    const key = addMonths(startKey, i);
    cum += byMonth[key] || 0;
    if (!paidBackKey && invest > 0 && cum >= invest) paidBackKey = key;
    data.push({ key, label: monthLabel(key), actual: Math.round(cum * 100) / 100 });
  }

  let status, monthsToGo = null, paybackKey = null;
  if (invest <= 0) status = "none";
  else if (remaining <= 0) { status = "paid"; paybackKey = paidBackKey || nowKey; }
  else if (avgMonthly <= 0) status = "never";
  else {
    status = "projected";
    monthsToGo = Math.ceil(remaining / avgMonthly);
    paybackKey = addMonths(nowKey, monthsToGo);
  }

  // projected line from today to the payback month (max 10 years shown)
  if (data.length) data[data.length - 1].projected = data[data.length - 1].actual;
  if (status === "projected") {
    const horizon = Math.min(monthsToGo, 120);
    const step = Math.max(1, Math.ceil(horizon / 36));
    for (let i = step; i <= horizon; i += step) {
      const key = addMonths(nowKey, i);
      data.push({ key, label: monthLabel(key), projected: Math.round((recovered + avgMonthly * i) * 100) / 100 });
    }
    if (horizon % step !== 0) {
      const key = addMonths(nowKey, horizon);
      data.push({ key, label: monthLabel(key), projected: Math.round((recovered + avgMonthly * horizon) * 100) / 100 });
    }
  }

  return { invest, base, equipment, start, recovered, remaining, avgMonthly, roi, status, monthsToGo, paybackKey, elapsed, data };
}
