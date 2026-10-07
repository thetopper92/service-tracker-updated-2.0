import { useState } from "react";
import { createRoot } from "react-dom/client";
import Modal from "./Modal";
import Inp from "./Inp";
import Icon from "./Icon";

// Asks for the account password before something that deletes data.
// run(password) does the actual request; a wrong password shows an error and lets the user try again.
// Resolves with run()'s result, or null if cancelled.
export function askPassword({ title = "Confirm with your password", message, confirmLabel = "Delete", run }) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const prevOverflow = document.body.style.overflow;
    const finish = (value) => {
      root.unmount();
      host.remove();
      document.body.style.overflow = prevOverflow;
      resolve(value);
    };
    root.render(<PasswordPrompt title={title} message={message} confirmLabel={confirmLabel} run={run} onDone={finish} />);
  });
}

function PasswordPrompt({ title, message, confirmLabel, run, onDone }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pw) return setError("Enter your password.");
    setBusy(true); setError("");
    try {
      const result = await run(pw);
      onDone(result ?? true);
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={busy ? () => {} : () => onDone(null)}>
      <form onSubmit={submit} className="stack pw-confirm">
        <div className="alert warn"><Icon name="lock" size={16} /> <span>{message}</span></div>
        <Inp label="Your account password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
        {error && <div className="alert">{error}</div>}
        <div className="row-btns">
          <button type="button" className="btn ghost" onClick={() => onDone(null)} disabled={busy}>Cancel</button>
          <button className="btn danger" disabled={busy}>{busy ? "Please wait…" : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}
