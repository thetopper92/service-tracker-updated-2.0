import { useState } from "react";
import Modal from "./Modal";
import Inp from "./Inp";
import { todayISO } from "../formatters";

export default function TxForm({ tx, defaultType = "income", categories, settings, onSave, onClose }) {
  const editing = !!tx?.id;
  const [type, setType] = useState(tx?.type || defaultType);
  const catsFor = (t) => categories.filter((c) => c.type === t).map((c) => c.name);
  const [f, setF] = useState({
    amount: tx?.amount ?? "",
    category: tx?.category || catsFor(tx?.type || defaultType)[0] || "",
    date: tx?.date || todayISO(),
    description: tx?.description || "",
  });
  const [unpaid, setUnpaid] = useState(!!tx?.unpaid);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const switchType = (t) => {
    setType(t);
    const list = catsFor(t);
    if (!list.includes(f.category)) setF({ ...f, category: list[0] || "" });
  };

  const options = catsFor(type);
  if (f.category && !options.includes(f.category)) options.unshift(f.category);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.category) return setError("Add a category for this type first (More tab).");
    setBusy(true);
    try {
      await onSave({ ...f, type, amount: Number(f.amount), unpaid: type === "income" && unpaid }, tx?.id);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const accent = type === "income" ? "var(--green)" : "var(--red)";
  return (
    <Modal title={`${editing ? "Edit" : "Add"} ${type === "income" ? "Income" : "Expense"}`} onClose={onClose} accent={accent}>
      <form onSubmit={submit} className="stack">
        <div className="seg">
          <button type="button" className={type === "income" ? "on income" : ""} onClick={() => switchType("income")}>Income</button>
          <button type="button" className={type === "expense" ? "on expense" : ""} onClick={() => switchType("expense")}>Expense</button>
        </div>
        <label className="field">
          <span className="field-label">Amount</span>
          <div className="amount-wrap">
            <span>{settings.currency}</span>
            <input className="input amount" type="number" inputMode="decimal" step="0.01" min="0.01" value={f.amount} onChange={set("amount")} required placeholder="0.00" autoFocus={!editing} />
          </div>
        </label>
        <div className="grid2">
          <Inp label="Category" value={f.category} onChange={set("category")} options={options.length ? options : [""]} />
          <Inp label="Date" type="date" value={f.date} onChange={set("date")} required />
        </div>
        {type === "income" && (
          <label className={`owed-toggle ${unpaid ? "on" : ""}`}>
            <input type="checkbox" checked={unpaid} onChange={(e) => setUnpaid(e.target.checked)} />
            <span>
              <b>Not given to me yet</b>
              <small>Still counted as sales. Tracked under “Money owed to me” until you mark it received.</small>
            </span>
          </label>
        )}
        <Inp label="Description" type="textarea" value={f.description} onChange={set("description")} placeholder="What was this for? (optional)" />
        {error && <div className="alert">{error}</div>}
        <button className="btn block" style={{ background: accent, color: "#fff" }} disabled={busy}>
          {busy ? "Saving..." : editing ? "Save changes" : "Save transaction"}
        </button>
      </form>
    </Modal>
  );
}
