import { useMemo, useState } from "react";
import Icon from "./Icon";
import { fmtC, fmtD } from "../formatters";

const PERIODS = [["month", "This month"], ["year", "This year"], ["all", "All time"]];

export default function Dashboard({ user, transactions, categories, settings, onEdit, goHistory }) {
  const [period, setPeriod] = useState("month");
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yy = String(now.getFullYear());

  const list = useMemo(() => transactions.filter((t) =>
    period === "all" ? true : period === "year" ? t.date.startsWith(yy) : t.date.startsWith(ym)
  ), [transactions, period, ym, yy]);

  const inc = list.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exp = list.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
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
            <button key={k} className={period === k ? "on" : ""} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="cards">
        <Stat label="Revenue" value={fmtC(inc, settings)} icon="up" tone="green" />
        <Stat label="Expenses" value={fmtC(exp, settings)} icon="down" tone="red" />
        <Stat label="Net profit" value={fmtC(profit, settings)} icon="wallet" tone={profit >= 0 ? "blue" : "red"} />
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
                <li key={t.id} className="tx-row" onClick={() => onEdit(t)}>
                  <span className="dot" style={{ background: colorOf(t.type, t.category) }} />
                  <div className="tx-main">
                    <b>{t.category}</b>
                    <span className="muted small">{fmtD(t.date, settings)}{t.description ? ` · ${t.description}` : ""}</span>
                  </div>
                  <span className={`amt ${t.type}`}>{t.type === "income" ? "+" : "-"}{fmtC(t.amount, settings)}</span>
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
