import Icon from "./Icon";
import { fmtC, fmtD, todayISO } from "../formatters";
import { daysBetween } from "../oil";

// "Money owed to me": income recorded as sales but not received yet
export default function Owed({ transactions, settings, onReceived, onEdit }) {
  const list = transactions.filter((t) => t.type === "income" && t.unpaid).sort((a, b) => (a.date < b.date ? -1 : 1));
  const total = list.reduce((s, t) => s + t.amount, 0);
  const today = todayISO();

  return (
    <div>
      <div className="kv-grid">
        <div className="kv"><span className="muted small">Total not received</span><b className="owed-text">{fmtC(total, settings)}</b></div>
        <div className="kv"><span className="muted small">Payments waiting</span><b>{list.length}</b></div>
        <div className="kv"><span className="muted small">Oldest</span><b>{list[0] ? `${daysBetween(list[0].date, today)} days` : "—"}</b></div>
      </div>
      {list.length === 0 ? (
        <div className="empty">Nothing owed to you. When you add income, tick “Not given to me yet” to track it here.</div>
      ) : (
        <ul className="tx-list">
          {list.map((t) => (
            <li key={t.id} className="tx-row">
              <span className="dot" style={{ background: "var(--amber)" }} />
              <div className="tx-main" onClick={() => onEdit(t)}>
                <b>{t.category}{t.pending && <span className="pill pending">Not synced</span>}</b>
                <span className="muted small">
                  {fmtD(t.date, settings)} · waiting {daysBetween(t.date, today)} days{t.description ? ` · ${t.description}` : ""}
                </span>
              </div>
              <span className="amt owed-text">{fmtC(t.amount, settings)}</span>
              <button className="btn sm sell" onClick={() => onReceived(t)}><Icon name="check" size={15} /> Received</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
