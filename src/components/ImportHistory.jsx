import { useEffect, useState } from "react";
import Icon from "./Icon";
import { api } from "../api";
import { fmtC, fmtD } from "../formatters";
import { askPassword } from "./PasswordPrompt";

// Lists past imports/restores (rows saved together) so a wrong import can be undone
export default function ImportHistory({ settings, reload, refreshKey }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    try { setList(await api.get("/api/imports")); setError(""); } catch (e) { setError(e.message); setList([]); }
  };
  useEffect(() => { load(); }, [refreshKey]);

  const undo = async (b) => {
    const r = await askPassword({
      title: "Undo this import?",
      message: `${b.count} transactions (${b.income} income, ${b.expense} expenses) will be deleted. Transactions you added yourself are not affected. Enter your password to confirm.`,
      confirmLabel: "Delete these rows",
      run: (password) => api.post("/api/imports/undo", { at: b.at, password }),
    });
    if (!r) return;
    await reload();
    await load();
    alert(`Removed ${r.removed} imported transactions.`);
  };

  return (
    <div className="import-history">
      <div className="field-label">Undo an import</div>
      {error && <p className="small expense">{error}</p>}
      {list === null ? <p className="muted small">Loading…</p> : list.length === 0 ? (
        <p className="muted small">No imports to undo.</p>
      ) : (
        <ul className="oil-list">
          {list.map((b) => (
            <li key={b.at}>
              <div className="grow">
                <b>Imported {new Date(b.at_time).toLocaleString()}</b>
                <span className="muted small">
                  {b.count} rows · <span className="income">{b.income} income {fmtC(Number(b.income_total), settings)}</span> · <span className="expense">{b.expense} expenses {fmtC(Number(b.expense_total), settings)}</span>
                  {b.first_date ? ` · ${fmtD(b.first_date, settings)} – ${fmtD(b.last_date, settings)}` : ""}
                </span>
              </div>
              <button className="btn sm danger-ghost" onClick={() => undo(b)}><Icon name="trash" size={15} /> Undo</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
