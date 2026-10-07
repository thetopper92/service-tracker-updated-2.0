import Icon from "./Icon";

export default function YearPicker({ year, setYear, years }) {
  const i = years.indexOf(year);
  return (
    <div className="year-picker">
      <button className="icon-btn" disabled={i <= 0} onClick={() => setYear(years[i - 1])} aria-label="Previous year">‹</button>
      <span><Icon name="calendar" size={16} /> {year}</span>
      <button className="icon-btn" disabled={i >= years.length - 1} onClick={() => setYear(years[i + 1])} aria-label="Next year">›</button>
    </div>
  );
}

export function yearsOf(transactions) {
  const now = new Date().getFullYear();
  const set = new Set([now]);
  transactions.forEach((t) => set.add(Number(t.date.slice(0, 4))));
  return [...set].sort((a, b) => a - b);
}

export function monthly(transactions, year) {
  const rows = Array.from({ length: 12 }, (_, m) => ({ m, income: 0, expense: 0 }));
  transactions.forEach((t) => {
    if (Number(t.date.slice(0, 4)) !== year) return;
    rows[Number(t.date.slice(5, 7)) - 1][t.type] += t.amount;
  });
  return rows.map((r) => ({ ...r, profit: r.income - r.expense }));
}
