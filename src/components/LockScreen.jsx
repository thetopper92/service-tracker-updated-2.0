import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { unlockWithPasscode } from "../lock";
import { unlockWithBiometric } from "../bio";

const MAX_TRIES = 10;

export default function LockScreen({ uid, cfg, name, onUnlock, onForgot, onWipe }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const triedBio = useRef(false);
  const triesKey = `st:lockTries:${uid}`;
  const tries = () => Number(localStorage.getItem(triesKey) || 0);

  const submit = async (e) => {
    e?.preventDefault();
    if (!code) return;
    setBusy(true); setError("");
    const dek = await unlockWithPasscode(cfg, code);
    setBusy(false);
    if (dek) { localStorage.removeItem(triesKey); onUnlock(dek); return; }
    const n = tries() + 1;
    localStorage.setItem(triesKey, String(n));
    setCode("");
    if (n >= MAX_TRIES) { localStorage.removeItem(triesKey); onWipe(); return; }
    setError(`Wrong passcode. ${MAX_TRIES - n} tr${MAX_TRIES - n === 1 ? "y" : "ies"} left before this phone's data is removed.`);
  };

  const bio = async () => {
    setBusy(true); setError("");
    try {
      const dek = await unlockWithBiometric(cfg.bio);
      localStorage.removeItem(triesKey);
      onUnlock(dek);
    } catch (e) {
      setError(e.offline ? "Fingerprint unlock needs internet. Use your passcode." : e.message);
    } finally {
      setBusy(false);
    }
  };

  // offer fingerprint straight away when it's set up
  useEffect(() => {
    if (cfg?.bio && !triedBio.current && navigator.onLine) { triedBio.current = true; bio(); }
  }, []);

  return (
    <div className="lock">
      <div className="lock-card">
        <div className="brand-logo"><Icon name="lock" size={28} /></div>
        <h2>Service Tracker is locked</h2>
        <p className="muted">{name ? `${name} · ` : ""}Enter your passcode to unlock</p>
        <form onSubmit={submit} className="stack">
          <input className="input lock-input" type="password" inputMode={cfg?.numeric ? "numeric" : "text"} autoComplete="current-password"
            value={code} onChange={(e) => setCode(e.target.value)} placeholder="Passcode" autoFocus={!cfg?.bio} />
          <button className="btn primary block" disabled={busy || !code}>{busy ? "Checking…" : "Unlock"}</button>
        </form>
        {cfg?.bio && (
          <button className="btn ghost block" onClick={bio} disabled={busy}><Icon name="finger" size={20} /> Use fingerprint / Face ID</button>
        )}
        {error && <div className="alert">{error}</div>}
        <button className="link small" onClick={onForgot}>Forgot passcode? Log out</button>
      </div>
    </div>
  );
}
