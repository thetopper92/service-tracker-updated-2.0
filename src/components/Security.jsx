import { useEffect, useState } from "react";
import Icon from "./Icon";
import Modal from "./Modal";
import Inp from "./Inp";
import { getLockConfig, saveLockConfig, newDataKey, setupPasscode, unlockWithPasscode, biometricAvailable } from "../lock";
import { registerBiometric, removeBiometric } from "../bio";
import { getLocalKey } from "../offline";

const AUTOLOCK = [
  { value: "0", label: "Immediately when I leave the app" },
  { value: "1", label: "After 1 minute" },
  { value: "5", label: "After 5 minutes" },
  { value: "15", label: "After 15 minutes" },
  { value: "60", label: "After 1 hour" },
];

export default function Security({ uid, onLockEnabled, onLockDisabled, onLockNow }) {
  const [cfg, setCfg] = useState(() => getLockConfig(uid));
  const [modal, setModal] = useState(null); // "setup" | "change" | "off"
  const [bioOk, setBioOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { biometricAvailable().then(setBioOk); }, []);
  const save = (next) => { saveLockConfig(uid, next); setCfg(next); };

  const toggleBio = async () => {
    setBusy(true); setMsg("");
    try {
      if (cfg.bio) {
        await removeBiometric(cfg.bio);
        save({ ...cfg, bio: null });
        setMsg("Fingerprint / Face ID unlock turned off.");
      } else {
        const dek = getLocalKey();
        if (!dek) throw new Error("Unlock the app first.");
        const bio = await registerBiometric(dek);
        save({ ...cfg, bio });
        setMsg("Fingerprint / Face ID unlock is on.");
      }
    } catch (e) {
      setMsg(e.offline ? "This needs an internet connection." : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="note security-note">
        <Icon name="shield" size={18} />
        <div className="small">
          <b>How your data is protected</b>
          <ul>
            <li>Everything is sent over an encrypted connection (HTTPS) and stored encrypted (AES-256) by the database provider.</li>
            <li>Your account password and security answer are stored only as one-way hashes (scrypt), never as readable text.</li>
            <li>With app lock on, the copy of your data kept on this phone for offline use is encrypted (AES-256-GCM) with a key that only your passcode or fingerprint can unlock.</li>
            <li>Backups can be downloaded password-protected (Backup &amp; export).</li>
          </ul>
        </div>
      </div>

      {!cfg?.enabled ? (
        <div className="stack">
          <p className="small">Ask for a passcode (PIN or password) or fingerprint / Face ID every time the app is opened on this phone.</p>
          <button className="btn primary" onClick={() => setModal("setup")}><Icon name="lock" size={18} /> Turn on app lock</button>
        </div>
      ) : (
        <div className="stack">
          <div className="lock-row">
            <Icon name="lock" size={18} />
            <span className="grow"><b>App lock is on</b> for this phone</span>
            <button className="btn sm ghost" onClick={onLockNow}>Lock now</button>
          </div>
          <div className="lock-row">
            <Icon name="finger" size={18} />
            <span className="grow">
              <b>Fingerprint / Face ID</b>
              <span className="muted small">{bioOk ? (cfg.bio ? "On — used to unlock" : "Off") : "Not available on this device/browser"}</span>
            </span>
            {bioOk && <button className={`btn sm ${cfg.bio ? "ghost" : "primary"}`} disabled={busy} onClick={toggleBio}>{cfg.bio ? "Turn off" : "Turn on"}</button>}
          </div>
          <Inp label="Lock the app" value={String(cfg.autoLock ?? 1)} options={AUTOLOCK}
            onChange={(e) => save({ ...cfg, autoLock: Number(e.target.value) })} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setModal("change")}><Icon name="key" size={18} /> Change passcode</button>
            <button className="btn danger-ghost" onClick={() => setModal("off")}>Turn off app lock</button>
          </div>
        </div>
      )}
      {msg && <p className="muted small">{msg}</p>}
      <p className="muted small">App lock is set per phone. If you forget the passcode, log out and log in again with your account password — your data is safe on your account.</p>

      {modal === "setup" && (
        <PasscodeForm title="Set app passcode" onClose={() => setModal(null)} onSubmit={async (code) => {
          const dek = await newDataKey();
          const pin = await setupPasscode(code, dek);
          const next = { enabled: true, pin, bio: null, autoLock: 1, numeric: /^\d+$/.test(code) };
          save(next);
          await onLockEnabled(dek);
          setModal(null);
          setMsg(bioOk ? "App lock is on. You can also turn on fingerprint / Face ID." : "App lock is on.");
        }} />
      )}
      {modal === "change" && (
        <PasscodeForm title="Change passcode" needCurrent onClose={() => setModal(null)} onSubmit={async (code, current) => {
          const dek = await unlockWithPasscode(cfg, current);
          if (!dek) throw new Error("Current passcode is not correct.");
          save({ ...cfg, pin: await setupPasscode(code, dek), numeric: /^\d+$/.test(code) });
          setModal(null);
          setMsg("Passcode changed.");
        }} />
      )}
      {modal === "off" && (
        <PasscodeForm title="Turn off app lock" onlyCurrent onClose={() => setModal(null)} onSubmit={async (_code, current) => {
          const dek = await unlockWithPasscode(cfg, current);
          if (!dek) throw new Error("Passcode is not correct.");
          await removeBiometric(cfg.bio);
          save(null);
          await onLockDisabled();
          setModal(null);
          setMsg("App lock is off.");
        }} />
      )}
    </div>
  );
}

function PasscodeForm({ title, needCurrent, onlyCurrent, onClose, onSubmit }) {
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!onlyCurrent) {
      if (code.length < 4) return setError("Use at least 4 characters (a 4–6 digit PIN or a password).");
      if (code !== again) return setError("The two passcodes don't match.");
    }
    setBusy(true);
    try { await onSubmit(code, current); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        {(needCurrent || onlyCurrent) && <Inp label="Current passcode" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />}
        {!onlyCurrent && (
          <>
            <Inp label="New passcode (PIN or password)" type="password" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus={!needCurrent} autoComplete="new-password" />
            <Inp label="Type it again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} required autoComplete="new-password" />
          </>
        )}
        {error && <div className="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Please wait…" : "Save"}</button>
      </form>
    </Modal>
  );
}
