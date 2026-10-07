import { useMemo, useState } from "react";
import Icon from "./Icon";
import { fmtC, fmtD, todayISO } from "../formatters";

const PERIODS = [["month", "This month"], ["year", "This year"], ["all", "All time"], ["custom", "Dates"]];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

export default function Dashboard({ user, transactions, categories, settings, onEdit, onDelete, onReceived, goHistory, oil, onOilDone, goOil }) {
  const [period, setPeriod] = useState("month");
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yy = String(now.getFullYear());
  const [from, setFrom] = useState(`${ym}-01`);
  const [to, setTo] = useState(todayISO());
  // If From is after To, swap them so the range still works
  const [lo, hi] = from && to && from > to ? [to, from] : [from, to];

  const list = useMemo(() => transactions.filter((t) =>
    period === "all" ? true
      : period === "year" ? t.date.startsWith(yy)
      : period === "custom" ? (!lo || t.date >= lo) && (!hi || t.date <= hi)
      : t.date.startsWith(ym)
  ), [transactions, period, ym, yy, lo, hi]);

  const lastMonth = () => {
    const a = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const b = new Date(now.getFullYear(), now.getMonth(), 0);
    setFrom(iso(a)); setTo(iso(b));
  };
  const presets = [
    ["Last 7 days", () => { setFrom(daysAgo(6)); setTo(todayISO()); }],
    ["Last 30 days", () => { setFrom(daysAgo(29)); setTo(todayISO()); }],
    ["Last month", lastMonth],
  ];

  const inc = list.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exp = list.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const owed = list.filter((t) => t.type === "income" && t.unpaid).reduce((s, t) => s + t.amount, 0);
  const profit = inc - exp;
  const margin = inc > 0 ? (profit / inc) * 100 : 0;
  const roi = exp > 0 ? (profit / exp) * 100 : 0;

  const colorOf = (type, name) => categories.find((c) => c.type === type && c.name === name)?.color || "#94a3b8";
  const topExp = useMemo(() => {
    const m = {};
    list.filter((t) => t.type === "expense").forEach((t) => { m[t.category] = (m[t.category] || 0) + t.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [list]);

  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{greet}, {user.name.split(" ")[0]}</h2>
          <p className="muted">Here is how your business is doing.</p>
        </div>
        <div className="seg small">
          {PERIODS.map(([k, l]) => (
            <button key={k} className={period === k ? "on" : ""} onClick={() => setPeriod(k)}>
              {k === "custom" && <Icon name="calendar" size={14} />} {l}
            </button>
          ))}
        </div>
      </div>

      {period === "custom" && (
        <div className="panel date-range">
          <div className="date-range-row">
            <label className="field">
              <span className="field-label">From</span>
              <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            </label>
            <label className="field">
              <span className="field-label">To</span>
              <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            </label>
          </div>
          <div className="chip-row">
            {presets.map(([l, f]) => <button key={l} type="button" className="chip" onClick={f}>{l}</button>)}
          </div>
          <p className="muted small">
            {lo && hi ? `${fmtD(lo, settings)} – ${fmtD(hi, settings)}` : lo ? `From ${fmtD(lo, settings)}` : hi ? `Up to ${fmtD(hi, settings)}` : "All dates"} · {list.length} transaction{list.length === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {oil?.has && oil.due && (
        <div className="due-banner">
          <Icon name="oil" size={22} />
          <div className="grow">
            <b>Oil change due</b>
            <span className="small">{oil.since} days since your last oil change{oil.left < 0 ? ` · ${-oil.left} day${oil.left === -1 ? "" : "s"} overdue` : ""}</span>
          </div>
          <button className="btn sm" onClick={onOilDone}>Done today</button>
          <button className="btn sm ghost" onClick={goOil}>View</button>
        </div>
      )}

      <div className="cards">
        <Stat label="Net profit" value={fmtC(profit, settings)} icon="wallet" tone={profit >= 0 ? "blue" : "red"} />
        <Stat label="Revenue" value={fmtC(inc, settings)} icon="up" tone="green" sub={owed > 0 ? `incl. ${fmtC(owed, settings)} not received` : null} />
        <Stat label="Expenses" value={fmtC(exp, settings)} icon="down" tone="red" />
        <Stat label="Profit margin" value={`${margin.toFixed(1)}%`} sub={`ROI ${roi.toFixed(1)}%`} icon="trend" tone="amber" />
      </div>

      <div className="grid-2col">
        <div className="panel">
          <div className="panel-head">
            <h3>Recent transactions</h3>
            <button className="link" onClick={goHistory}>See all</button>
          </div>
          {list.length === 0 ? (
            <Empty text="No transactions in this period yet. Tap + to add one." />
          ) : (
            <ul className="tx-list">
              {list.slice(0, 6).map((t) => (
                <li key={t.id} className="tx-row">
                  <span className="dot" style={{ background: colorOf(t.type, t.category) }} />
                  <div className="tx-main" onClick={() => onEdit(t)}>
                    <b>
                      {t.category}
                      {t.unpaid && <span className="pill owed">Not received</span>}
                      {t.pending && <span className="pill pending">Not synced</span>}
                    </b>
                    <span className="muted small">{fmtD(t.date, settings)}{t.description ? ` · ${t.description}` : ""}</span>
                  </div>
                  <span className={`amt ${t.type}`}>{t.type === "income" ? "+" : "-"}{fmtC(t.amount, settings)}</span>
                  <div className="row-actions">
                    {t.unpaid && <button className="icon-btn ok" onClick={() => onReceived(t)} aria-label="Mark received" title="Mark received"><Icon name="check" size={17} /></button>}
                    <button className="icon-btn" onClick={() => onEdit(t)} aria-label="Edit"><Icon name="edit" size={17} /></button>
                    <button className="icon-btn danger" onClick={() => onDelete(t)} aria-label="Delete"><Icon name="trash" size={17} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Top expenses</h3></div>
          {topExp.length === 0 ? (
            <Empty text="No expenses in this period." />
          ) : (
            <div className="bars">
              {topExp.map(([name, val]) => (
                <div key={name} className="bar-row">
                  <div className="bar-label"><span>{name}</span><b>{fmtC(val, settings)}</b></div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(val / topExp[0][1]) * 100}%`, background: colorOf("expense", name) }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, icon, tone }) {
  return (
    <div className="stat">
      <div className={`stat-icon ${tone}`}><Icon name={icon} size={18} /></div>
      <span className="muted small">{label}</span>
      <b className="stat-value">{value}</b>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
}

export function Empty({ text }) {
  return <div className="empty">{text}</div>;
}
