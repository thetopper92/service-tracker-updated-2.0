import { useEffect, useState } from "react";
import Icon from "./Icon";

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export default function InstallApp({ bare }) {
  const [canPrompt, setCanPrompt] = useState(!!window.__installPrompt);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onInstallable = () => setCanPrompt(true);
    const onInstalled = () => { setInstalled(true); setCanPrompt(false); };
    window.addEventListener("installable", onInstallable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("installable", onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    const p = window.__installPrompt;
    if (!p) return;
    p.prompt();
    const choice = await p.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstalled(true);
    window.__installPrompt = null;
    setCanPrompt(false);
  };

  return (
    <div className={bare ? "" : "panel"}>
      {!bare && <div className="panel-head"><h3><Icon name="phone" size={18} /> Phone app</h3></div>}
      {installed ? (
        <p className="note">Installed. The app works offline — changes you make without internet are saved on this phone and synced to your account automatically.</p>
      ) : canPrompt ? (
        <div className="stack">
          <p className="muted small">Install Service Tracker on this device. It opens like a normal app and works offline.</p>
          <button className="btn primary" onClick={install}><Icon name="download" size={18} /> Install app</button>
        </div>
      ) : isIOS() ? (
        <ol className="steps">
          <li>Open this page in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button (square with arrow).</li>
          <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        </ol>
      ) : (
        <ol className="steps">
          <li>Open the browser menu (⋮).</li>
          <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
        </ol>
      )}
      <p className="muted small">Your data is saved to your account, so it's the same on every phone or computer you log in on.</p>
    </div>
  );
}
