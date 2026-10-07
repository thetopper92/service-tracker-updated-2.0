import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend } from "recharts";
import { computePayback, monthLabel } from "../payback";
import { fmtC, fmtCS, fmtD } from "../formatters";

export function paybackText(p) {
  if (p.status === "none") return "Set your total business cost in More → Business Investment.";
  if (p.status === "paid") return `Paid back in ${monthLabel(p.paybackKey)}`;
  if (p.status === "never") return "Not paying back yet — profit so far is 0 or negative.";
  const y = Math.floor(p.monthsToGo / 12), m = p.monthsToGo % 12;
  const span = [y ? `${y} yr` : "", m ? `${m} mo` : ""].filter(Boolean).join(" ");
  return `About ${span} to go — around ${monthLabel(p.paybackKey)}`;
}

export default function Payback({ transactions, assets, settings, dark }) {
  const p = computePayback(transactions, assets, settings);
  const axis = { fill: dark ? "#94a3b8" : "#64748b", fontSize: 12 };
  const grid = dark ? "#1e293b" : "#e2e8f0";
  const pctDone = p.invest > 0 ? Math.max(0, Math.min(100, (p.recovered / p.invest) * 100)) : 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Investment payback (ROI)</h3>
        {p.status !== "none" && <span className="muted small">since {fmtD(p.start, settings)}</span>}
      </div>

      {p.status === "none" ? (
        <div className="empty">Add your total business cost in <b>More → Business Investment</b> to see when your investment returns.</div>
      ) : (
        <>
          <div className="kv-grid">
            <KV label="Total invested" value={fmtC(p.invest, settings)}
              sub={p.equipment ? `${fmtC(p.base, settings)} + ${fmtC(p.equipment, settings)} equipment` : null} />
            <KV label="Recovered so far" value={fmtC(p.recovered, settings)} tone={p.recovered >= 0 ? "income" : "expense"} />
            <KV label="Still to recover" value={fmtC(Math.max(0, p.remaining), settings)} />
            <KV label="ROI to date" value={`${p.roi.toFixed(1)}%`} tone={p.roi >= 0 ? "income" : "expense"} />
            <KV label="Avg monthly profit" value={fmtC(p.avgMonthly, settings)} sub={`over ${p.elapsed} month${p.elapsed === 1 ? "" : "s"}`} />
            <KV label="Payback" value={p.status === "projected" ? monthLabel(p.paybackKey) : p.status === "paid" ? "Done" : "—"}
              sub={p.status === "projected" ? `${p.monthsToGo} months from now` : null} />
          </div>

          <div className="progress">
            <div className="progress-bar"><div style={{ width: `${pctDone}%` }} /></div>
            <span className="small"><b>{pctDone.toFixed(0)}%</b> recovered · {paybackText(p)}</span>
          </div>

          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={p.data} margin={{ left: -10, right: 12, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCS(v, settings)} width={64}
                  domain={[(min) => Math.min(0, min), (max) => Math.max(max, p.invest * 1.05)]} />
                <Tooltip formatter={(v, n) => [fmtC(v, settings), n]}
                  contentStyle={{ background: dark ? "#0f172a" : "#fff", border: "1px solid " + grid, borderRadius: 12 }} />
                <Legend />
                <ReferenceLine y={p.invest} stroke="#F7B731" strokeDasharray="6 4" label={{ value: `Investment ${fmtCS(p.invest, settings)}`, position: "insideTopLeft", fill: "#c98a00", fontSize: 12 }} />
                <Line type="monotone" dataKey="actual" name="Profit recovered" stroke="#34C97B" strokeWidth={3} dot={false} connectNulls />
                <Line type="monotone" dataKey="projected" name="Projected" stroke="#4F8EF7" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="muted small">Projection uses your average monthly profit (revenue − expenses) since the start date.</p>
        </>
      )}
    </div>
  );
}

function KV({ label, value, sub, tone }) {
  return (
    <div className="kv">
      <span className="muted small">{label}</span>
      <b className={tone || ""}>{value}</b>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
}
