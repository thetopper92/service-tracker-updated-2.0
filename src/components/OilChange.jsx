import { useEffect, useState } from "react";
import Icon from "./Icon";
import Modal from "./Modal";
import Inp from "./Inp";
import { api } from "../api";
import { fmtD, todayISO } from "../formatters";
import { oilStatus, daysBetween } from "../oil";
import { pushState, enablePush, disablePush } from "../push";

export default function OilChange({ oilChanges, settings, reload, goSettings }) {
  const st = oilStatus(oilChanges, settings.oilInterval);
  const [form, setForm] = useState(null); // {} new, record = edit

  const remove = async (c) => {
    if (!confirm(`Delete the oil change on ${fmtD(c.date, settings)}?`)) return;
    try { await api.del(`/api/oil/${c.id}`); await reload(); } catch (e) { alert(e.message); }
  };

  const pct = st.has ? Math.min(100, (st.since / st.interval) * 100) : 0;

  return (
    <div>
      {st.has ? (
        <div className={`oil-status ${st.due ? "due" : st.left <= 7 ? "soon" : ""}`}>
          <div className="oil-big">
            <b>{st.since}</b>
            <span>day{st.since === 1 ? "" : "s"} since last oil change</span>
          </div>
          <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
          <div className="oil-meta small">
            <span>Last: <b>{fmtD(st.last.date, settings)}</b></span>
            <span>Next due: <b>{fmtD(st.dueDate, settings)}</b></span>
            <span>
              {st.due
                ? <b className="expense">{st.left === 0 ? "Due today" : `${-st.left} day${st.left === -1 ? "" : "s"} overdue`}</b>
                : <b>{st.left} day{st.left === 1 ? "" : "s"} left</b>}
            </span>
          </div>
        </div>
      ) : (
        <div className="empty">No oil changes logged yet. Add your last one to start tracking.</div>
      )}

      <div className="oil-actions">
        <button className="btn primary" onClick={() => setForm({})}><Icon name="plus" size={16} /> Log oil change</button>
        <span className="muted small">
          Every <b>{settings.oilInterval} days</b> · <button className="link" onClick={goSettings}>change in Settings</button>
          {st.avg ? <> · your average: {st.avg} days</> : null}
        </span>
      </div>

      <Reminders />

      {st.has && (
        <ul className="oil-list">
          {st.sorted.map((c, i) => {
            const prev = st.sorted[i + 1];
            return (
              <li key={c.id}>
                <div className="grow">
                  <b>{fmtD(c.date, settings)}</b>
                  <span className="muted small">
                    {prev ? `${daysBetween(prev.date, c.date)} days after previous` : "First record"}
                    {c.odometer ? ` · ${c.odometer} km` : ""}{c.notes ? ` · ${c.notes}` : ""}
                  </span>
                </div>
                <button className="icon-btn" onClick={() => setForm(c)} aria-label="Edit"><Icon name="edit" size={17} /></button>
                <button className="icon-btn danger" onClick={() => remove(c)} aria-label="Delete"><Icon name="trash" size={17} /></button>
              </li>
            );
          })}
        </ul>
      )}

      {form && <OilForm rec={form} onClose={() => setForm(null)} onDone={async () => { setForm(null); await reload(); }} />}
    </div>
  );
}

function OilForm({ rec, onClose, onDone }) {
  const editing = !!rec.id;
  const [f, setF] = useState({ date: rec.date || todayISO(), odometer: rec.odometer || "", notes: rec.notes || "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (editing) await api.put(`/api/oil/${rec.id}`, f); else await api.post("/api/oil", f);
      await onDone();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal title={editing ? "Edit oil change" : "Log oil change"} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Inp label="Date of oil change" type="date" value={f.date} onChange={set("date")} required />
        <Inp label="Odometer (optional)" inputMode="numeric" value={f.odometer} onChange={set("odometer")} placeholder="e.g. 45200" />
        <Inp label="Notes (optional)" value={f.notes} onChange={set("notes")} placeholder="Oil type, workshop, cost..." />
        {error && <div className="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Save"}</button>
      </form>
    </Modal>
  );
}

function Reminders() {
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { pushState().then(setState); }, []);

  const turnOn = async () => {
    setBusy(true); setMsg("");
    try { await enablePush(); setState("on"); setMsg("Reminders are on for this phone."); }
    catch (e) { setMsg(e.message); setState(await pushState()); }
    finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true);
    try { await disablePush(); setState("off"); setMsg(""); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setMsg("");
    try { await api.post("/api/push/test"); setMsg("Test notification sent."); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="reminder-box">
      <Icon name="bell" size={18} />
      <div className="grow small">
        {state === "on" && <><b>Reminders on</b> — you'll get a notification on this phone when an oil change is due (checked every morning).</>}
        {state === "off" && <><b>Get a notification when it's due</b> — even when the app is closed.</>}
        {state === "denied" && <><b>Notifications are blocked</b> for this site. Allow them in your phone/browser settings, then try again.</>}
        {state === "ios-install" && <><b>On iPhone:</b> add the app to your Home Screen first (More → Phone app), then open it from there to turn on reminders.</>}
        {state === "unsupported" && <>This browser doesn't support notifications. You'll still see a banner on Home when it's due.</>}
        {state === "loading" && <>Checking notifications…</>}
        {msg && <div className="muted">{msg}</div>}
      </div>
      {state === "off" && <button className="btn sm primary" disabled={busy} onClick={turnOn}>Turn on</button>}
      {state === "on" && (
        <>
          <button className="btn sm ghost" disabled={busy} onClick={test}>Test</button>
          <button className="btn sm ghost" disabled={busy} onClick={turnOff}>Turn off</button>
        </>
      )}
    </div>
  );
}
