import { useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import YearPicker, { yearsOf, monthly } from "./YearPicker";
import { MONTHS } from "../data";
import { fmtC, fmtCS } from "../formatters";

const TABS = [["overview", "Overview"], ["month", "Same month last year"], ["yearly", "Yearly"]];
const METRICS = [["income", "Income"], ["expense", "Expenses"], ["profit", "Profit"]];

// % change; null when there is nothing to compare against
const growthOf = (cur, prev) => (prev === 0 ? (cur === 0 ? 0 : null) : ((cur - prev) / Math.abs(prev)) * 100);
const sum = (arr, k) => arr.reduce((s, r) => s + r[k], 0);

// Number of finished months in a year (the current month only counts once it's over)
function completeMonths(year) {
  const now = new Date();
  if (year < now.getFullYear()) return 12;
  if (year > now.getFullYear()) return 0;
  return now.getMonth(); // e.g. in October: Jan–Sep = 9
}
const rangeLabel = (n) => (n >= 12 ? "" : n === 0 ? "no complete months" : n === 1 ? "Jan" : `Jan–${MONTHS[n - 1]}`);

export default function Growth({ transactions, settings, dark }) {
  const [tab, setTab] = useState("overview");
  const years = yearsOf(transactions);
  const [year, setYear] = useState(new Date().getFullYear());
  const chart = {
    axis: { fill: dark ? "#94a3b8" : "#64748b", fontSize: 12 },
    grid: dark ? "#1e293b" : "#e2e8f0",
    tip: { contentStyle: { background: dark ? "#0f172a" : "#fff", border: "1px solid " + (dark ? "#1e293b" : "#e2e8f0"), borderRadius: 12 } },
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Growth</h2>
        {tab !== "yearly" && <YearPicker year={year} setYear={setYear} years={years} />}
      </div>
      <div className="seg tabs-seg">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "overview" && <Overview transactions={transactions} year={year} settings={settings} chart={chart} />}
      {tab === "month" && <SameMonth transactions={transactions} year={year} settings={settings} chart={chart} />}
      {tab === "yearly" && <Yearly transactions={transactions} settings={settings} chart={chart} />}
    </div>
  );
}

// ---------------- Overview ----------------
function Overview({ transactions, year, settings, chart }) {
  const rows = useMemo(() => monthly(transactions, year), [transactions, year]);
  const prevRows = useMemo(() => monthly(transactions, year - 1), [transactions, year]);
  const n = completeMonths(year);
  const done = rows.slice(0, n);
  const prevSame = prevRows.slice(0, n);
  const now = new Date();
  const inProgress = year === now.getFullYear() ? rows[now.getMonth()] : null;

  let cum = 0;
  const cumData = done.map((r) => ({ name: MONTHS[r.m], profit: (cum += r.profit) }));
  const withData = done.filter((r) => r.income || r.expense);
  const best = withData.length ? withData.reduce((a, b) => (b.profit > a.profit ? b : a)) : null;
  const worst = withData.length ? withData.reduce((a, b) => (b.profit < a.profit ? b : a)) : null;
  const avg = withData.length ? sum(withData, "profit") / withData.length : 0;
  const span = rangeLabel(n);

  return (
    <>
      <p className="muted small">
        {inProgress ? `${MONTHS[now.getMonth()]} isn't finished yet, so it's left out of the comparisons below.` : ""}
        {span && n > 0 ? ` Comparing ${span} ${year} with ${span} ${year - 1}.` : ""}
      </p>
      <div className="cards">
        <Change label={`Revenue vs ${year - 1}`} cur={sum(done, "income")} prev={sum(prevSame, "income")} settings={settings} />
        <Change label={`Profit vs ${year - 1}`} cur={sum(done, "profit")} prev={sum(prevSame, "profit")} settings={settings} />
        <Mini label="Best month" value={best ? `${MONTHS[best.m]} · ${fmtCS(best.profit, settings)}` : "—"} />
        <Mini label="Average monthly profit" value={fmtC(avg, settings)} good={avg >= 0} sub={withData.length ? `${withData.length} complete month${withData.length === 1 ? "" : "s"}` : null} />
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Cumulative profit {year}{span ? ` (${span})` : ""}</h3></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cumData} margin={{ left: -10, right: 8 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F8EF7" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#4F8EF7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
              <XAxis dataKey="name" tick={chart.axis} axisLine={false} tickLine={false} />
              <YAxis tick={chart.axis} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCS(v, settings)} width={60} />
              <Tooltip formatter={(v) => fmtC(v, settings)} {...chart.tip} />
              <Area type="monotone" dataKey="profit" name="Cumulative profit" stroke="#4F8EF7" strokeWidth={3} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Month by month</h3>{worst && <span className="muted small">Weakest: {MONTHS[worst.m]}</span>}</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Profit</th><th>vs previous month</th></tr></thead>
            <tbody>
              {inProgress && (
                <tr className="in-progress">
                  <td>{MONTHS[inProgress.m]}</td>
                  <td className="income">{fmtC(inProgress.income, settings)}</td>
                  <td className="expense">{fmtC(inProgress.expense, settings)}</td>
                  <td><b>{fmtC(inProgress.profit, settings)}</b></td>
                  <td><span className="pill">In progress</span></td>
                </tr>
              )}
              {done.slice().reverse().map((r) => {
                const prev = r.m === 0 ? prevRows[11] : rows[r.m - 1];
                return (
                  <tr key={r.m}>
                    <td>{MONTHS[r.m]}</td>
                    <td className="income">{fmtC(r.income, settings)}</td>
                    <td className="expense">{fmtC(r.expense, settings)}</td>
                    <td><b>{fmtC(r.profit, settings)}</b></td>
                    <td><Pct cur={r.profit} prev={prev.profit} /></td>
                  </tr>
                );
              })}
              {done.length === 0 && !inProgress && <tr><td colSpan={5} className="muted">No months yet for {year}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------------- Same month vs last year ----------------
function SameMonth({ transactions, year, settings, chart }) {
  const rows = useMemo(() => monthly(transactions, year), [transactions, year]);
  const prevRows = useMemo(() => monthly(transactions, year - 1), [transactions, year]);
  const n = completeMonths(year);
  const months = rows.slice(0, n).filter((r) => r.income || r.expense || prevRows[r.m].income || prevRows[r.m].expense);
  const [metric, setMetric] = useState("profit");
  const [pick, setPick] = useState(null);
  const sel = months.find((r) => r.m === pick) ? pick : months.length ? months[months.length - 1].m : null;

  if (!months.length) {
    return <div className="panel"><div className="empty">No complete months to compare for {year} yet.</div></div>;
  }
  const cur = rows[sel], prev = prevRows[sel];
  const data = months.map((r) => ({ name: MONTHS[r.m], [year - 1]: prevRows[r.m][metric], [year]: r[metric] }));
  const metricName = METRICS.find(([k]) => k === metric)[1];

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>{MONTHS[sel]} {year} vs {MONTHS[sel]} {year - 1}</h3>
          <select className="input compact" value={sel} onChange={(e) => setPick(Number(e.target.value))}>
            {months.map((r) => <option key={r.m} value={r.m}>{MONTHS[r.m]}</option>)}
          </select>
        </div>
        <div className="compare-list">
          {METRICS.map(([k, label]) => (
            <CompareRow key={k} label={label} cur={cur[k]} prev={prev[k]} curLabel={`${MONTHS[sel]} ${year}`} prevLabel={`${MONTHS[sel]} ${year - 1}`}
              upIsGood={k !== "expense"} settings={settings} />
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{metricName}: {year} vs {year - 1}</h3>
          <div className="seg small">
            {METRICS.map(([k, l]) => <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>{l}</button>)}
          </div>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -10, right: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
              <XAxis dataKey="name" tick={chart.axis} axisLine={false} tickLine={false} />
              <YAxis tick={chart.axis} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCS(v, settings)} width={60} />
              <Tooltip formatter={(v) => fmtC(v, settings)} {...chart.tip} />
              <Legend />
              <Bar dataKey={String(year - 1)} fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey={String(year)} fill={metric === "expense" ? "#E05C5C" : metric === "income" ? "#34C97B" : "#4F8EF7"} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Month</th><th>{year - 1}</th><th>{year}</th><th>Change</th><th>%</th></tr></thead>
            <tbody>
              {months.slice().reverse().map((r) => {
                const a = prevRows[r.m][metric], b = r[metric];
                return (
                  <tr key={r.m}>
                    <td>{MONTHS[r.m]}</td>
                    <td>{fmtC(a, settings)}</td>
                    <td><b>{fmtC(b, settings)}</b></td>
                    <td className={(b - a >= 0) === (metric !== "expense") ? "income" : "expense"}>{b - a >= 0 ? "+" : ""}{fmtC(b - a, settings)}</td>
                    <td><Pct cur={b} prev={a} upIsGood={metric !== "expense"} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------------- Yearly (up to 5 years) ----------------
function Yearly({ transactions, settings, chart }) {
  const thisYear = new Date().getFullYear();
  const dataYears = [...new Set(transactions.map((t) => Number(t.date.slice(0, 4))))].filter((y) => y <= thisYear).sort((a, b) => b - a).slice(0, 5);
  const nNow = completeMonths(thisYear);

  const stats = dataYears.map((y) => {
    const r = monthly(transactions, y);
    const n = y === thisYear ? nNow : 12;
    const part = r.slice(0, n);
    const firstMonth = r.findIndex((x) => x.income || x.expense);
    const inc = sum(part, "income"), exp = sum(part, "expense");
    // compare with the previous year over the same months
    const p = monthly(transactions, y - 1).slice(0, n);
    const pInc = sum(p, "income"), pExp = sum(p, "expense");
    const hasPrev = transactions.some((t) => Number(t.date.slice(0, 4)) === y - 1);
    return {
      y, n, inc, exp, profit: inc - exp, margin: inc ? ((inc - exp) / inc) * 100 : 0,
      pInc, pExp, pProfit: pInc - pExp, hasPrev,
      label: y === thisYear && n < 12 ? `${y} (${rangeLabel(n)})` : String(y),
      lateStart: firstMonth > 0 && y !== thisYear ? MONTHS[firstMonth] : null,
    };
  });

  if (!stats.length) return <div className="panel"><div className="empty">No data yet.</div></div>;
  const chartData = stats.slice().reverse().map((s) => ({ name: s.label, Income: s.inc, Expenses: s.exp, Profit: s.profit }));

  return (
    <>
      <p className="muted small">
        Up to 5 years with data. {nNow < 12 && stats[0]?.y === thisYear ? `${thisYear} only counts finished months (${rangeLabel(nNow)}) and is compared with the same months of ${thisYear - 1}.` : ""}
      </p>
      <div className="year-cards">
        {stats.map((s) => (
          <div key={s.y} className="panel year-card">
            <div className="panel-head">
              <h3>{s.label}</h3>
              {s.lateStart && <span className="muted small">data from {s.lateStart}</span>}
            </div>
            <div className="compare-list">
              <CompareRow label="Income" cur={s.inc} prev={s.hasPrev ? s.pInc : null} upIsGood settings={settings} />
              <CompareRow label="Expenses" cur={s.exp} prev={s.hasPrev ? s.pExp : null} upIsGood={false} settings={settings} />
              <CompareRow label="Profit" cur={s.profit} prev={s.hasPrev ? s.pProfit : null} upIsGood settings={settings} />
            </div>
            <p className="muted small">Margin {s.margin.toFixed(1)}%{s.hasPrev ? ` · compared with ${s.y - 1}${s.n < 12 ? ` (${rangeLabel(s.n)})` : ""}` : " · no earlier year to compare"}</p>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Year by year</h3></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: -10, right: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
              <XAxis dataKey="name" tick={chart.axis} axisLine={false} tickLine={false} />
              <YAxis tick={chart.axis} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCS(v, settings)} width={60} />
              <Tooltip formatter={(v) => fmtC(v, settings)} {...chart.tip} />
              <Legend />
              <Bar dataKey="Income" fill="#34C97B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Expenses" fill="#E05C5C" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Profit" fill="#4F8EF7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Year</th><th>Income</th><th>Expenses</th><th>Profit</th><th>Margin</th><th>Profit growth</th></tr></thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.y}>
                  <td>{s.label}</td>
                  <td className="income">{fmtC(s.inc, settings)}</td>
                  <td className="expense">{fmtC(s.exp, settings)}</td>
                  <td><b>{fmtC(s.profit, settings)}</b></td>
                  <td>{s.margin.toFixed(1)}%</td>
                  <td>{s.hasPrev ? <Pct cur={s.profit} prev={s.pProfit} /> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------------- small pieces ----------------
function Pct({ cur, prev, upIsGood = true }) {
  const g = growthOf(cur, prev);
  if (g === null) return <span className="pill">New</span>;
  if (Math.abs(g) < 0.05) return <span className="pill">No change</span>;
  const up = g > 0;
  return <span className={`pill ${up === upIsGood ? "good" : "bad"}`}>{up ? "▲" : "▼"} {Math.abs(g).toFixed(1)}%</span>;
}

function CompareRow({ label, cur, prev, curLabel, prevLabel, upIsGood, settings }) {
  const diff = prev === null ? null : cur - prev;
  return (
    <div className="compare-row">
      <span className="compare-label">{label}</span>
      <span className="compare-vals">
        <b>{fmtC(cur, settings)}</b>
        {prev !== null && <span className="muted small">{prevLabel ? `${prevLabel}: ` : "was "}{fmtC(prev, settings)}</span>}
      </span>
      {prev !== null ? (
        <span className="compare-change">
          <Pct cur={cur} prev={prev} upIsGood={upIsGood} />
          <span className={`small ${diff === 0 ? "muted" : (diff > 0) === upIsGood ? "income" : "expense"}`}>{diff >= 0 ? "+" : ""}{fmtC(diff, settings)}</span>
        </span>
      ) : <span />}
    </div>
  );
}

function Change({ label, cur, prev, settings }) {
  const g = growthOf(cur, prev);
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <b className={`stat-value sm ${g === null ? "" : g >= 0 ? "income" : "expense"}`}>{g === null ? "New" : `${g >= 0 ? "▲" : "▼"} ${Math.abs(g).toFixed(1)}%`}</b>
      <span className="muted small">{fmtC(cur, settings)} vs {fmtC(prev, settings)}</span>
    </div>
  );
}

function Mini({ label, value, good, sub }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <b className={`stat-value sm ${good === undefined ? "" : good ? "income" : "expense"}`}>{value}</b>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
}
