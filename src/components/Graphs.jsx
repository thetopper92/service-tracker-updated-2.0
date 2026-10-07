import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import YearPicker, { yearsOf, monthly } from "./YearPicker";
import { Empty } from "./Dashboard";
import { MONTHS } from "../data";
import { fmtC, fmtCS } from "../formatters";

export default function Graphs({ transactions, categories, settings, dark }) {
  const years = yearsOf(transactions);
  const [year, setYear] = useState(new Date().getFullYear());
  const data = useMemo(() => monthly(transactions, year).map((r) => ({ ...r, name: MONTHS[r.m] })), [transactions, year]);
  const yearTx = transactions.filter((t) => Number(t.date.slice(0, 4)) === year);

  const byCat = (type) => {
    const m = {};
    yearTx.filter((t) => t.type === type).forEach((t) => { m[t.category] = (m[t.category] || 0) + t.amount; });
    return Object.entries(m).map(([name, value]) => ({
      name, value, color: categories.find((c) => c.type === type && c.name === name)?.color || "#94a3b8",
    })).sort((a, b) => b.value - a.value);
  };
  const incCats = byCat("income");
  const expCats = byCat("expense");

  const axis = { fill: dark ? "#94a3b8" : "#64748b", fontSize: 12 };
  const grid = dark ? "#1e293b" : "#e2e8f0";
  const tip = {
    contentStyle: { background: dark ? "#0f172a" : "#fff", border: "1px solid " + grid, borderRadius: 12 },
    formatter: (v) => fmtC(v, settings),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Graphs</h2>
        <YearPicker year={year} setYear={setYear} years={years} />
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Income vs expenses</h3></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -10, right: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
              <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCS(v, settings)} width={60} />
              <Tooltip {...tip} cursor={{ fill: dark ? "#1e293b55" : "#e2e8f055" }} />
              <Legend />
              <Bar dataKey="income" name="Income" fill="#34C97B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="#E05C5C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Net profit by month</h3></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: -10, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
              <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCS(v, settings)} width={60} />
              <Tooltip {...tip} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#4F8EF7" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2col">
        <PiePanel title="Income by category" data={incCats} tip={tip} settings={settings} />
        <PiePanel title="Expenses by category" data={expCats} tip={tip} settings={settings} />
      </div>
    </div>
  );
}

function PiePanel({ title, data, tip, settings }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="panel">
      <div className="panel-head"><h3>{title}</h3></div>
      {data.length === 0 ? <Empty text="No data for this year." /> : (
        <>
          <div className="chart small">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="85%" paddingAngle={2}>
                  {data.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip {...tip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="legend">
            {data.map((d) => (
              <li key={d.name}>
                <span className="dot" style={{ background: d.color }} />
                <span className="grow">{d.name}</span>
                <b>{fmtC(d.value, settings)}</b>
                <span className="muted small">{((d.value / total) * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
