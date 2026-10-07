import { useRef, useState } from "react";
import Icon from "./Icon";
import Modal from "./Modal";
import Inp from "./Inp";
import { api } from "../api";
import { COLORS, CURRENCIES, DATE_FORMATS, TABS, BACKUP_PREFIX } from "../data";
import { fmtC, todayISO } from "../formatters";
import { exportCSV } from "../exportCSV";
import Assets from "./Assets";
import Investment from "./Investment";

export default function Categories({ user, categories, transactions, assets, settings, onSettings, reload, onLogout, goGraphs }) {
  const [editCat, setEditCat] = useState(null); // {type} for new, category for edit
  const [pwOpen, setPwOpen] = useState(false);
  const fileRef = useRef(null);

  const countOf = (c) => transactions.filter((t) => t.type === c.type && t.category === c.name).length;

  const removeCat = async (c) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try { await api.del(`/api/categories/${c.id}`); reload(); } catch (e) { alert(e.message); }
  };

  const backup = async () => {
    const data = await api.get("/api/backup");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `${BACKUP_PREFIX}${todayISO()}.json`;
    a.click();
  };

  const restore = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm("Restoring replaces ALL your current transactions and categories. Continue?")) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const r = await api.post("/api/restore", data);
        alert(`Restored ${r.transactions} transactions.`);
        reload(true);
      } catch (err) {
        alert(err.message.includes("JSON") ? "This file is not a valid backup." : err.message);
      }
    };
    reader.readAsText(file);
  };

  const set = (k) => (e) => onSettings({ ...settings, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <div className="page">
      <div className="page-head"><h2>More</h2></div>

      <div className="grid-2col">
        {["income", "expense"].map((type) => (
          <div key={type} className="panel">
            <div className="panel-head">
              <h3><span className={`dot-lg ${type}`} /> {type === "income" ? "Income" : "Expense"} categories</h3>
              <button className="btn ghost sm" onClick={() => setEditCat({ type })}><Icon name="plus" size={16} /> Add</button>
            </div>
            <ul className="cat-list">
              {categories.filter((c) => c.type === type).map((c) => (
                <li key={c.id}>
                  <span className="dot" style={{ background: c.color || "#94a3b8" }} />
                  <span className="grow">{c.name}</span>
                  <span className="muted small">{countOf(c)}</span>
                  <button className="icon-btn" onClick={() => setEditCat(c)} aria-label={`Edit ${c.name}`}><Icon name="edit" size={17} /></button>
                  <button className="icon-btn danger" onClick={() => removeCat(c)} aria-label={`Delete ${c.name}`}><Icon name="trash" size={17} /></button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Assets assets={assets} settings={settings} reload={reload} />

      <Investment transactions={transactions} assets={assets} settings={settings} onSettings={onSettings} goGraphs={goGraphs} />

      <div className="panel">
        <div className="panel-head"><h3><Icon name="settings" size={18} /> Settings</h3></div>
        <div className="settings-grid">
          <Inp label="Currency" value={settings.currency} onChange={set("currency")}
            options={CURRENCIES.map((c) => ({ value: c.symbol, label: `${c.symbol}  ${c.name}` }))} />
          <Inp label="Currency position" value={settings.currencyPos} onChange={set("currencyPos")}
            options={[{ value: "before", label: "Before amount ($100)" }, { value: "after", label: "After amount (100$)" }]} />
          <Inp label="Date format" value={settings.dateFormat} onChange={set("dateFormat")} options={DATE_FORMATS} />
          <Inp label="Thousands separator" value={settings.thousandSep} onChange={set("thousandSep")}
            options={[{ value: ",", label: "Comma (1,000)" }, { value: ".", label: "Dot (1.000)" }, { value: " ", label: "Space (1 000)" }, { value: "", label: "None (1000)" }]} />
          <Inp label="Decimal separator" value={settings.decimalSep} onChange={set("decimalSep")}
            options={[{ value: ".", label: "Dot (0.50)" }, { value: ",", label: "Comma (0,50)" }]} />
          <Inp label="Start page" value={settings.defaultTab} onChange={set("defaultTab")} options={TABS.map(([v, , l]) => ({ value: v, label: l }))} />
          <Inp label="Theme" value={settings.theme} onChange={set("theme")} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          <label className="field check">
            <input type="checkbox" checked={settings.showCents} onChange={set("showCents")} />
            <span>Show cents</span>
          </label>
        </div>
        <p className="muted small">Preview: {fmtC(1234567.89, settings)}</p>
      </div>

      <div className="grid-2col">
        <div className="panel">
          <div className="panel-head"><h3>Backup &amp; export</h3></div>
          <div className="btn-col">
            <button className="btn ghost" onClick={backup}><Icon name="download" size={18} /> Download backup (JSON)</button>
            <button className="btn ghost" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Restore from backup</button>
            <button className="btn ghost" onClick={() => exportCSV(transactions)}><Icon name="list" size={18} /> Export all to CSV (Excel)</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={restore} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Account</h3></div>
          <p><b>{user.name}</b><br /><span className="muted">{user.email}</span></p>
          <div className="btn-col">
            <button className="btn ghost" onClick={() => setPwOpen(true)}><Icon name="key" size={18} /> Change password</button>
            <button className="btn danger-ghost" onClick={onLogout}><Icon name="logout" size={18} /> Log out</button>
          </div>
        </div>
      </div>

      {editCat && <CatForm cat={editCat} onClose={() => setEditCat(null)} onDone={() => { setEditCat(null); reload(); }} />}
      {pwOpen && <PasswordForm onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function CatForm({ cat, onClose, onDone }) {
  const editing = !!cat.id;
  const [name, setName] = useState(cat.name || "");
  const [color, setColor] = useState(cat.color || COLORS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (editing) await api.put(`/api/categories/${cat.id}`, { name, color });
      else await api.post("/api/categories", { name, color, type: cat.type });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`${editing ? "Edit" : "New"} ${cat.type} category`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Inp label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        {editing && <p className="muted small">Renaming also updates all transactions in this category.</p>}
        <div className="field">
          <span className="field-label">Colour</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button type="button" key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
          </div>
        </div>
        {error && <div className="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Add category"}</button>
      </form>
    </Modal>
  );
}

function PasswordForm({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.put("/api/auth/password", { current, next });
      setDone(true);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? (
        <div className="stack">
          <div className="note">Password changed.</div>
          <button className="btn primary block" onClick={onClose}>Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          <Inp label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          <Inp label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} autoComplete="new-password" />
          {error && <div className="alert">{error}</div>}
          <button className="btn primary block">Change password</button>
        </form>
      )}
    </Modal>
  );
}
