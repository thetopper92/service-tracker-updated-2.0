import { useMemo, useState } from "react";
import Icon from "./Icon";
import { Empty } from "./Dashboard";
import { MONTHS } from "../data";
import { fmtC, fmtD } from "../formatters";
import { exportCSV } from "../exportCSV";

export default function Transactions({ transactions, categories, settings, onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [month, setMonth] = useState("all");
  const [cat, setCat] = useState("all");

  const months = useMemo(() => [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse(), [transactions]);
  const catNames = useMemo(() => [...new Set(categories.filter((c) => type === "all" || c.type === type).map((c) => c.name))], [categories, type]);

  const list = transactions.filter((t) =>
    (type === "all" || t.type === type) &&
    (month === "all" || t.date.startsWith(month)) &&
    (cat === "all" || t.category === cat) &&
    (!search || `${t.category} ${t.description} ${t.amount}`.toLowerCase().includes(search.toLowerCase()))
  );
  const inc = list.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exp = list.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const colorOf = (t) => categories.find((c) => c.type === t.type && c.name === t.category)?.color || "#94a3b8";

  const groups = [];
  list.forEach((t) => {
    const g = groups[groups.length - 1];
    if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] });
  });

  return (
    <div className="page">
      <div className="page-head">
        <h2>History</h2>
        <button className="btn ghost" onClick={() => exportCSV(list, `ServiceTracker_${month === "all" ? "all" : month}.csv`)}>
          <Icon name="download" size={18} /> Export CSV
        </button>
      </div>

      <div className="filters">
        <div className="search">
          <Icon name="search" size={18} />
          <input placeholder="Search transactions" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input" value={type} onChange={(e) => { setType(e.target.value); setCat("all"); }}>
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}
        </select>
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="summary">
        <span>In <b className="income">{fmtC(inc, settings)}</b></span>
        <span>Out <b className="expense">{fmtC(exp, settings)}</b></span>
        <span>Net <b>{fmtC(inc - exp, settings)}</b></span>
        <span className="muted">{list.length} item{list.length === 1 ? "" : "s"}</span>
      </div>

      {list.length === 0 ? (
        <div className="panel"><Empty text={transactions.length ? "No transactions match these filters." : "No transactions yet. Tap + to add your first one."} /></div>
      ) : (
        groups.map((g) => (
          <div key={g.date} className="panel tight">
            <div className="group-date">{fmtD(g.date, settings)}</div>
            <ul className="tx-list">
              {g.items.map((t) => (
                <li key={t.id} className="tx-row">
                  <span className="dot" style={{ background: colorOf(t) }} />
                  <div className="tx-main" onClick={() => onEdit(t)}>
                    <b>{t.category}</b>
                    {t.description && <span className="muted small">{t.description}</span>}
                  </div>
                  <span className={`amt ${t.type}`}>{t.type === "income" ? "+" : "-"}{fmtC(t.amount, settings)}</span>
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => onEdit(t)} aria-label="Edit"><Icon name="edit" size={17} /></button>
                    <button className="icon-btn danger" onClick={() => onDelete(t)} aria-label="Delete"><Icon name="trash" size={17} /></button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
