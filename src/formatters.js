import { MONTHS } from "./data";

export function fmtC(n, settings = {}) {
  const { currency="$", currencyPos="before", decimalSep=".", thousandSep=",", showCents=true } = settings;
  const abs  = Math.abs(Number(n) || 0);
  const sign = n < 0 ? "-" : "";
  const [intPart, decPart] = abs.toFixed(2).split(".");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);
  const num = showCents ? `${intFormatted}${decimalSep}${decPart}` : intFormatted;
  return sign + (currencyPos === "before" ? currency + num : num + currency);
}

export function fmtCS(n, settings = {}) {
  const { currency="$", currencyPos="before" } = settings;
  const abs  = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  let num;
  if (abs >= 1e6)      num = (abs / 1e6).toFixed(1) + "M";
  else if (abs >= 1e3) num = (abs / 1e3).toFixed(1) + "K";
  else                 return fmtC(n, settings);
  return sign + (currencyPos === "before" ? currency + num : num + currency);
}

export function fmtD(iso, settings = {}) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  switch (settings.dateFormat) {
    case "DD/MM/YYYY": return `${d}/${m}/${y}`;
    case "MM/DD/YYYY": return `${m}/${d}/${y}`;
    case "DD-MM-YYYY": return `${d}-${m}-${y}`;
    case "MMM DD, YYYY": return `${MONTHS[Number(m) - 1]} ${d}, ${y}`;
    default: return iso;
  }
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const pct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
