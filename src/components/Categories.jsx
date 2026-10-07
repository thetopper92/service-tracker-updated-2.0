import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import Modal from "./Modal";
import Inp from "./Inp";
import { api } from "../api";
import { COLORS, CURRENCIES, DATE_FORMATS, TABS, BACKUP_PREFIX } from "../data";
import { fmtC, todayISO } from "../formatters";
import { exportCSV } from "../exportCSV";
import { askPassword } from "./PasswordPrompt";
import Assets from "./Assets";
import Investment from "./Investment";
import InstallApp from "./InstallApp";
import Owed from "./Owed";
import OilChange from "./OilChange";
import { computePayback } from "../payback";
import { oilStatus } from "../oil";
import Security from "./Security";
import DbImport from "./DbImport";
import ImportHistory from "./ImportHistory";
import { encryptBackup, decryptBackup, getLockConfig } from "../lock";
import { buildDb } from "../dbfile";

const SECTION_KEY = "st-open-sections";

export default function Categories({ user, categories, transactions, assets, oilChanges, settings, onSettings, reload, onLogout, goGraphs, onEdit, onReceived, focus, onLockEnabled, onLockDisabled, onLockNow }) {
  const [editCat, setEditCat] = useState(null); // {type} for new, category for edit
  const [pwOpen, setPwOpen] = useState(false);
  const [dbFile, setDbFile] = useState(null);
  const [pwPrompt, setPwPrompt] = useState(null); // { mode: "encrypt" } | { mode: "decrypt", file }
  const [lockTick, setLockTick] = useState(0);
  const [importTick, setImportTick] = useState(0);
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SECTION_KEY) || "[]"); } catch { return []; }
  });
  const fileRef = useRef(null);

  const toggle = (id) => setOpen((o) => {
    const next = o.includes(id) ? o.filter((x) => x !== id) : [...o, id];
    try { localStorage.setItem(SECTION_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const openAndScroll = (id) => {
    setOpen((o) => (o.includes(id) ? o : [...o, id]));
    setTimeout(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  // Open a section when coming from a link (e.g. oil change reminder)
  useEffect(() => { if (focus?.id) openAndScroll(focus.id); }, [focus]);

  const countOf = (c) => transactions.filter((t) => t.type === c.type && t.category === c.name).length;

  const removeCat = async (c) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try { await api.del(`/api/categories/${c.id}`); reload(); } catch (e) { alert(e.message); }
  };

  const download = (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const backup = async (kind) => {
    try {
      const data = await api.get("/api/backup");
      if (kind === "db") {
        download(new Blob([await buildDb(data)], { type: "application/vnd.sqlite3" }), `${BACKUP_PREFIX}${todayISO()}.db`);
      } else {
        download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${BACKUP_PREFIX}${todayISO()}.json`);
      }
    } catch (e) { alert(e.message); }
  };

  const encryptedBackup = async (password) => {
    const data = await api.get("/api/backup");
    const file = await encryptBackup(password, data);
    download(new Blob([JSON.stringify(file)], { type: "application/octet-stream" }), `${BACKUP_PREFIX}${todayISO()}.stbak`);
  };

  const restoreData = async (data) => {
    const r = await askPassword({
      title: "Restore this backup?",
      message: "Restoring deletes ALL your current data and replaces it with this backup. Enter your password to confirm.",
      confirmLabel: "Delete and restore",
      run: (password) => api.post("/api/restore", { ...data, password }),
    });
    if (!r) return;
    await reload(true);
    setImportTick((n) => n + 1);
    alert(`Restored ${r.transactions} transactions.`);
  };

  // One button for every backup type: .json, password-protected .stbak, and .db / .sqlite databases.
  // The file is read immediately: on Android, resetting the picker (or waiting) can revoke permission to read it.
  const restore = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (err) {
      input.value = "";
      alert(err?.name === "NotReadableError" || err?.name === "NotFoundError"
        ? "Your phone didn't allow the app to read this file. Copy it into your phone's Downloads folder (not straight from Google Drive, WhatsApp or another app) and choose it again from there."
        : `Couldn't read this file: ${err?.message || err}`);
      return;
    }
    input.value = "";
    const bytes = new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength));
    const isSqlite = new TextDecoder().decode(bytes).startsWith("SQLite format 3");
    try {
      if (isSqlite || /\.(db|sqlite|sqlite3|db3)$/i.test(file.name)) {
        setDbFile({ name: file.name, size: file.size, buffer });
        return;
      }
      const text = new TextDecoder().decode(buffer);
      let data;
      try { data = JSON.parse(text); } catch { throw new Error("This file is not a valid backup or .db database."); }
      if (data?.format === "ServiceTracker-encrypted-backup") { setPwPrompt({ mode: "decrypt", file: data }); return; }
      if (!Array.isArray(data?.transactions)) throw new Error("This file is not a Service Tracker backup.");
      await restoreData(data);
    } catch (err) {
      alert(err.message);
    }
  };

  const set = (k) => (e) => onSettings({ ...settings, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  // one-line summaries shown on each closed section
  const owedList = transactions.filter((t) => t.type === "income" && t.unpaid);
  const owedTotal = owedList.reduce((s, t) => s + t.amount, 0);
  const activeAssets = assets.filter((a) => a.status === "active");
  const pb = computePayback(transactions, assets, settings);
  const oil = oilStatus(oilChanges, settings.oilInterval);
  const sec = (id) => ({ id, open: open.includes(id), onToggle: toggle });

  return (
    <div className="page">
      <div className="page-head"><h2>More</h2></div>

      <div className="sections">
        <Section {...sec("categories")} icon="tag" title="Categories" summary={`${categories.length} categories`}>
          <div className="grid-2col">
            {["income", "expense"].map((type) => (
              <div key={type}>
                <div className="panel-head">
                  <h3><span className={`dot-lg ${type}`} /> {type === "income" ? "Income" : "Expense"}</h3>
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
        </Section>

        <Section {...sec("owed")} icon="owed" title="Money owed to me"
          summary={owedList.length ? `${fmtC(owedTotal, settings)} not received · ${owedList.length} payment${owedList.length === 1 ? "" : "s"}` : "Nothing owed"}
          badge={owedList.length ? "amber" : null}>
          <Owed transactions={transactions} settings={settings} onReceived={onReceived} onEdit={onEdit} />
        </Section>

        <Section {...sec("equipment")} icon="box" title="Equipment & Assets"
          summary={`${activeAssets.length} in use · ${fmtC(activeAssets.reduce((s, a) => s + Number(a.cost || 0), 0), settings)}`}>
          <Assets assets={assets} settings={settings} reload={reload} bare />
        </Section>

        <Section {...sec("investment")} icon="trend" title="Business Investment"
          summary={pb.status === "none" ? "Not set" : `${pb.roi.toFixed(1)}% recovered of ${fmtC(pb.invest, settings)}`}>
          <Investment transactions={transactions} assets={assets} settings={settings} onSettings={onSettings} goGraphs={goGraphs} bare />
        </Section>

        <Section {...sec("settings")} icon="settings" title="Settings" summary={`${settings.currency} · ${settings.dateFormat} · ${settings.theme === "dark" ? "Dark" : "Light"}`}>
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
            <OilIntervalInput settings={settings} onSettings={onSettings} />
            <label className="field check">
              <input type="checkbox" checked={settings.showCents} onChange={set("showCents")} />
              <span>Show cents</span>
            </label>
          </div>
          <p className="muted small">Preview: {fmtC(1234567.89, settings)}</p>
        </Section>

        <Section {...sec("security")} icon="shield" title="Security & app lock"
          summary={getLockConfig(user.id)?.enabled ? `App lock on${getLockConfig(user.id)?.bio ? " · fingerprint" : ""}` : "App lock off"} key={`sec-${lockTick}`}>
          <Security uid={user.id}
            onLockEnabled={async (dek) => { await onLockEnabled(dek); setLockTick((n) => n + 1); }}
            onLockDisabled={async () => { await onLockDisabled(); setLockTick((n) => n + 1); }}
            onLockNow={onLockNow} />
        </Section>

        <Section {...sec("backup")} icon="download" title="Backup & export" summary="Download, restore, import .db, CSV">
          <div className="btn-col">
            <button className="btn ghost" onClick={() => setPwPrompt({ mode: "encrypt" })}><Icon name="lock" size={18} /> Download password-protected backup (.stbak)</button>
            <button className="btn ghost" onClick={() => backup("json")}><Icon name="download" size={18} /> Download backup (.json)</button>
            <button className="btn ghost" onClick={() => backup("db")}><Icon name="download" size={18} /> Download backup (.db database)</button>
            <button className="btn ghost" onClick={() => exportCSV(transactions)}><Icon name="list" size={18} /> Export all to CSV (Excel)</button>
            <button className="btn primary" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Restore or import a file…</button>
            <input ref={fileRef} type="file" accept=".json,.stbak,.db,.sqlite,.sqlite3,.db3,application/json,application/octet-stream,application/x-sqlite3,application/vnd.sqlite3" hidden onChange={restore} />
          </div>
          <p className="muted small">Restore accepts Service Tracker backups (.json, .stbak, .db) and can import transactions from other apps' .db / .sqlite databases.</p>
          <ImportHistory settings={settings} reload={reload} refreshKey={importTick} />
        </Section>

        <Section {...sec("account")} icon="key" title="Account" summary={user.email}>
          <p><b>{user.name}</b><br /><span className="muted">{user.email}</span></p>
          <div className="btn-col">
            <button className="btn ghost" onClick={() => setPwOpen(true)}><Icon name="key" size={18} /> Change password</button>
            <button className="btn danger-ghost" onClick={onLogout}><Icon name="logout" size={18} /> Log out</button>
          </div>
        </Section>

        <Section {...sec("app")} icon="phone" title="Phone app" summary="Install · works offline">
          <InstallApp bare />
        </Section>

        <Section {...sec("oil")} icon="oil" title="Oil change"
          summary={oil.has ? (oil.due ? `Due — ${oil.since} days since last change` : `${oil.since} days since last · ${oil.left} days left`) : "Not tracked yet"}
          badge={oil.has && oil.due ? "red" : null}>
          <OilChange oilChanges={oilChanges} settings={settings} reload={reload} goSettings={() => openAndScroll("settings")} />
        </Section>
      </div>

      {editCat && <CatForm cat={editCat} onClose={() => setEditCat(null)} onDone={() => { setEditCat(null); reload(); }} />}
      {pwOpen && <PasswordForm onClose={() => setPwOpen(false)} />}
      {dbFile && <DbImport file={dbFile} settings={settings} onClose={() => setDbFile(null)}
        onDone={async (msg) => { setDbFile(null); await reload(true); setImportTick((n) => n + 1); alert(msg); }} />}
      {pwPrompt && (
        <BackupPassword mode={pwPrompt.mode} onClose={() => setPwPrompt(null)} onSubmit={async (password) => {
          if (pwPrompt.mode === "encrypt") { await encryptedBackup(password); setPwPrompt(null); return; }
          const data = await decryptBackup(password, pwPrompt.file);
          setPwPrompt(null);
          await restoreData(data);
        }} />
      )}
    </div>
  );
}

function Section({ id, title, icon, summary, badge, open, onToggle, children }) {
  return (
    <div className={`section ${open ? "open" : ""}`} id={`sec-${id}`}>
      <button className="section-head" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className={`section-icon ${badge || ""}`}><Icon name={icon} size={18} /></span>
        <span className="section-title">
          <b>{title}</b>
          {summary && <span className="muted small">{summary}</span>}
        </span>
        <Icon name="chevron" size={20} className="chev" />
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

function OilIntervalInput({ settings, onSettings }) {
  const [v, setV] = useState(settings.oilInterval);
  useEffect(() => { setV(settings.oilInterval); }, [settings.oilInterval]);
  const save = () => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 1 || n > 3650) { setV(settings.oilInterval); return; }
    if (n !== settings.oilInterval) onSettings({ ...settings, oilInterval: n });
  };
  return (
    <Inp label="Oil change interval (days)" type="number" min="1" max="3650" inputMode="numeric" value={v}
      onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      hint="You'll be reminded after this many days." />
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

function BackupPassword({ mode, onClose, onSubmit }) {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const encrypting = mode === "encrypt";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (encrypting && pw.length < 6) return setError("Use at least 6 characters.");
    if (encrypting && pw !== again) return setError("The passwords don't match.");
    setBusy(true);
    try { await onSubmit(pw); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal title={encrypting ? "Password-protected backup" : "Open protected backup"} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <p className="muted small">{encrypting
          ? "The backup file is encrypted with AES-256. Keep this password safe — without it the file can't be opened."
          : "Enter the password used when this backup was made."}</p>
        <Inp label="Backup password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus autoComplete="new-password" />
        {encrypting && <Inp label="Type it again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} required autoComplete="new-password" />}
        {error && <div className="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Please wait…" : encrypting ? "Download" : "Open and restore"}</button>
      </form>
    </Modal>
  );
}
