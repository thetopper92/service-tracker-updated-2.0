import { useEffect, useState } from "react";
import Icon from "./Icon";
import Inp from "./Inp";
import { computePayback } from "../payback";
import { paybackText } from "./Payback";
import { fmtC } from "../formatters";

export default function Investment({ transactions, assets, settings, onSettings, goGraphs, bare }) {
  const [amount, setAmount] = useState(settings.investAmount || "");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setAmount(settings.investAmount || ""); }, [settings.investAmount]);

  const p = computePayback(transactions, assets, settings);
  const save = (patch) => onSettings({ ...settings, ...patch });

  const saveAmount = async (e) => {
    e.preventDefault();
    await save({ investAmount: Number(amount) || 0 });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className={bare ? "" : "panel"}>
      {!bare && <div className="panel-head"><h3><Icon name="trend" size={18} /> Business Investment</h3></div>}
      <form onSubmit={saveAmount} className="invest-form">
        <Inp label="Total business cost (money put in)" type="number" step="0.01" min="0" inputMode="decimal"
          value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50000" />
        <Inp label="Start date (optional)" type="date" value={settings.investDate || ""}
          onChange={(e) => save({ investDate: e.target.value })} hint="Leave empty to start from your first record." />
        <button className="btn primary">{saved ? "Saved ✓" : "Save"}</button>
      </form>
      <label className="field check inline">
        <input type="checkbox" checked={settings.investIncludeEquip} onChange={(e) => save({ investIncludeEquip: e.target.checked })} />
        <span>Add equipment costs to the investment ({fmtC(p.equipment || assets.reduce((s, a) => s + Number(a.cost || 0), 0), settings)})</span>
      </label>
      {p.status !== "none" && (
        <div className="note invest-note">
          <b>{fmtC(p.recovered, settings)}</b> of <b>{fmtC(p.invest, settings)}</b> recovered ({p.roi.toFixed(1)}% ROI). {paybackText(p)}
          <button type="button" className="link" onClick={goGraphs}> See graph →</button>
        </div>
      )}
    </div>
  );
}
