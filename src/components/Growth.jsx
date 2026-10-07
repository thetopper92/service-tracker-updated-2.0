import { useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import YearPicker, { yearsOf, monthly } from "./YearPicker";
import { MONTHS } from "../data";
import { fmtC, fmtCS, pct } from "../formatters";

export default function Growth({ transactions, settings, dark }) {
  const years = yearsOf(transactions);
  const [year, setYear] = useState(new Date().getFullYear());
  const rows = useMemo(() => monthly(transactions, year), [transactions, year]);
  const prevRows = useMemo(() => monthly(transactions, year - 1), [transactions, year]);

  const now = new Date();
  const lastMonth = year === now.getFullYear() ? now.getMonth() : year > now.getFullYear() ? -1 : 11;
  const active = rows.slice(0, lastMonth + 1);

  let cum = 0;
  const cumData = active.map((r) => ({ name: MONTHS[r.m], profit: (cum += r.profit) }));

  const sum = (arr, k) => arr.reduce((s, r) => s + r[k], 0);
  const yInc = sum(rows, "income"), yExp = sum(rows, "expense"), yPro = yInc - yExp;
  const pInc = sum(prevRows, "income"), pPro = sum(prevRows, "profit");
  const growthOf = (cur, prev) => (prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / Math.abs(prev)) * 100);

  const withData = active.filter((r) => r.income || r.expense);
  const best = withData.length ? withData.reduce((a, b) => (b.profit > a.profit ? b : a)) : null;
  const worst = withData.length ? withData.reduce((a, b) => (b.profit < a.profit ? b : a)) : null;
  const avg = active.length ? sum(active, "profit") / active.length : 0;

  const axis = { fill: dark ? "#94a3b8" : "#64748b", fontSize: 12 };
  const grid = dark ? "#1e293b" : "#e2e8f0";

  return (
    <div className="page">
      <div className="page-head">
        <h2>Growth</h2>
        <YearPicker year={year} setYear={setYear} years={years} />
      </div>

      <div className="cards">
        <Mini label={`Revenue vs ${year - 1}`} value={pct(growthOf(yInc, pInc))} good={yInc >= pInc} />
        <Mini label={`Profit vs ${year - 1}`} value={pct(growthOf(yPro, pPro))} good={yPro >= pPro} />
        <Mini label="Best month" value={best ? `${MONTHS[best.m]} · ${fmtCS(best.profit, settings)}` : "—"} />
        <Mini label="Average monthly profit" value={fmtC(avg, settings)} good={avg >= 0} />
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Cumulative profit {year}</h3></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cumData} margin={{ left: -10, right: 8 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F8EF7" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#4F8EF7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
              <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCS(v, settings)} width={60} />
              <Tooltip formatter={(v) => fmtC(v, settings)} contentStyle={{ background: dark ? "#0f172a" : "#fff", border: "1px solid " + grid, borderRadius: 12 }} />
              <Area type="monotone" dataKey="profit" name="Cumulative profit" stroke="#4F8EF7" strokeWidth={3} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Month by month</h3>{worst && <span className="muted small">Weakest: {MONTHS[worst.m]}</span>}</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Month</th><th>Income</th><th>Expenses</th><th>Profit</th><th>Growth</th></tr>
            </thead>
            <tbody>
              {active.slice().reverse().map((r) => {
                const prev = r.m === 0 ? prevRows[11] : rows[r.m - 1];
                const g = growthOf(r.profit, prev.profit);
                return (
                  <tr key={r.m}>
                    <td>{MONTHS[r.m]}</td>
                    <td className="income">{fmtC(r.income, settings)}</td>
                    <td className="expense">{fmtC(r.expense, settings)}</td>
                    <td><b>{fmtC(r.profit, settings)}</b></td>
                    <td><span className={`pill ${g >= 0 ? "good" : "bad"}`}>{pct(g)}</span></td>
                  </tr>
                );
              })}
              {active.length === 0 && <tr><td colSpan={5} className="muted">No months yet for {year}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, good }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <b className={`stat-value sm ${good === undefined ? "" : good ? "income" : "expense"}`}>{value}</b>
    </div>
  );
}
