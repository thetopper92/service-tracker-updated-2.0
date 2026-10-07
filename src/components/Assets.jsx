import { useState } from "react";
import Icon from "./Icon";
import Modal from "./Modal";
import Inp from "./Inp";
import { api } from "../api";
import { fmtC, fmtD, todayISO } from "../formatters";

const STATUS = { active: "In use", sold: "Sold", written_off: "Written off" };
const FILTERS = [["active", "In use"], ["sold", "Sold"], ["written_off", "Written off"], ["all", "All"]];

export default function Assets({ assets, settings, reload, bare }) {
  const [filter, setFilter] = useState("active");
  const [form, setForm] = useState(null);   // {} new, asset = edit
  const [sell, setSell] = useState(null);   // asset
  const [writeOff, setWriteOff] = useState(null);

  const sum = (list, k) => list.reduce((s, a) => s + Number(a[k] || 0), 0);
  const active = assets.filter((a) => a.status === "active");
  const sold = assets.filter((a) => a.status === "sold");
  const gone = assets.filter((a) => a.status === "written_off");
  const list = filter === "all" ? assets : assets.filter((a) => a.status === filter);

  const act = async (fn) => {
    try { await fn(); await reload(); } catch (e) { alert(e.message); }
  };
  const undo = (a) => {
    const msg = a.status === "sold"
      ? `Undo the sale of "${a.name}"? The ${fmtC(a.sale_price, settings)} sale income will be removed.`
      : `Put "${a.name}" back in use?`;
    if (confirm(msg)) act(() => api.post(`/api/assets/${a.id}/reactivate`));
  };
  const remove = (a) => {
    const msg = a.status === "sold"
      ? `Delete "${a.name}"? Its ${fmtC(a.sale_price, settings)} sale income will also be removed.`
      : `Delete "${a.name}"?`;
    if (confirm(msg)) act(() => api.del(`/api/assets/${a.id}`));
  };

  return (
    <div className={bare ? "" : "panel"}>
      <div className={bare ? "section-toolbar" : "panel-head"}>
        {!bare && <h3><Icon name="box" size={18} /> Equipment &amp; Assets</h3>}
        <button className="btn ghost sm" onClick={() => setForm({})}><Icon name="plus" size={16} /> Add equipment</button>
      </div>

      <div className="kv-grid">
        <div className="kv"><span className="muted small">Value in use</span><b>{fmtC(sum(active, "cost"), settings)}</b><span className="muted small">{active.length} item{active.length === 1 ? "" : "s"}</span></div>
        <div className="kv"><span className="muted small">Total spent</span><b>{fmtC(sum(assets, "cost"), settings)}</b></div>
        <div className="kv"><span className="muted small">Sold for</span><b className="income">{fmtC(sum(sold, "sale_price"), settings)}</b><span className="muted small">{sold.length} sold</span></div>
        <div className="kv"><span className="muted small">Written off</span><b className="expense">{fmtC(sum(gone, "cost"), settings)}</b><span className="muted small">{gone.length} item{gone.length === 1 ? "" : "s"}</span></div>
      </div>

      <div className="chips">
        {FILTERS.map(([k, l]) => (
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty">{assets.length ? "Nothing here." : "No equipment yet. Add things like tools, vehicles, computers or machines."}</div>
      ) : (
        <ul className="asset-list">
          {list.map((a) => (
            <li key={a.id} className={a.status !== "active" ? "dim" : ""}>
              <div className="asset-main">
                <div className="asset-top">
                  <b>{a.name}</b>
                  <span className={`pill ${a.status}`}>{STATUS[a.status]}</span>
                </div>
                <span className="muted small">
                  {a.category ? `${a.category} · ` : ""}Bought {fmtD(a.purchase_date, settings)} for {fmtC(a.cost, settings)}
                  {a.status === "sold" && ` · Sold ${fmtD(a.end_date, settings)} for ${fmtC(a.sale_price, settings)}`}
                  {a.status === "written_off" && ` · Written off ${fmtD(a.end_date, settings)}`}
                </span>
                {a.notes && <span className="muted small">{a.notes}</span>}
              </div>
              <div className="asset-value">
                <b>{fmtC(a.status === "active" ? a.cost : 0, settings)}</b>
                <span className="muted small">value</span>
              </div>
              <div className="asset-actions">
                {a.status === "active" ? (
                  <>
                    <button className="btn sm sell" onClick={() => setSell(a)}>Sell</button>
                    <button className="btn sm ghost" onClick={() => setWriteOff(a)}>Write off</button>
                  </>
                ) : (
                  <button className="btn sm ghost" onClick={() => undo(a)}>Undo</button>
                )}
                <button className="icon-btn" onClick={() => setForm(a)} aria-label={`Edit ${a.name}`}><Icon name="edit" size={17} /></button>
                <button className="icon-btn danger" onClick={() => remove(a)} aria-label={`Delete ${a.name}`}><Icon name="trash" size={17} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {form && <AssetForm asset={form} onClose={() => setForm(null)} onDone={async () => { setForm(null); await reload(); }} />}
      {sell && <SellForm asset={sell} settings={settings} onClose={() => setSell(null)} onDone={async () => { setSell(null); await reload(); }} />}
      {writeOff && <WriteOffForm asset={writeOff} settings={settings} onClose={() => setWriteOff(null)} onDone={async () => { setWriteOff(null); await reload(); }} />}
    </div>
  );
}

function useSubmit(onDone) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = (fn) => async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try { await fn(); await onDone(); } catch (err) { setError(err.message); setBusy(false); }
  };
  return { error, busy, run };
}

function AssetForm({ asset, onClose, onDone }) {
  const editing = !!asset.id;
  const [f, setF] = useState({
    name: asset.name || "", category: asset.category || "", cost: asset.cost ?? "",
    purchase_date: asset.purchase_date || todayISO(), notes: asset.notes || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const { error, busy, run } = useSubmit(onDone);
  const submit = run(() => (editing ? api.put(`/api/assets/${asset.id}`, f) : api.post("/api/assets", f)));

  return (
    <Modal title={editing ? "Edit equipment" : "Add equipment"} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Inp label="Name" value={f.name} onChange={set("name")} required placeholder="e.g. Delivery van, Laptop, Pressure washer" autoFocus />
        <div className="grid2">
          <Inp label="Cost" type="number" step="0.01" min="0" inputMode="decimal" value={f.cost} onChange={set("cost")} required />
          <Inp label="Purchase date" type="date" value={f.purchase_date} onChange={set("purchase_date")} required />
        </div>
        <Inp label="Type (optional)" value={f.category} onChange={set("category")} placeholder="e.g. Vehicle, Tools, Electronics" />
        <Inp label="Notes (optional)" type="textarea" value={f.notes} onChange={set("notes")} placeholder="Serial number, supplier, warranty..." />
        {error && <div className="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Add equipment"}</button>
      </form>
    </Modal>
  );
}

function SellForm({ asset, settings, onClose, onDone }) {
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayISO());
  const { error, busy, run } = useSubmit(onDone);
  const submit = run(() => api.post(`/api/assets/${asset.id}/sell`, { price: Number(price), date }));
  const diff = price ? Number(price) - asset.cost : null;

  return (
    <Modal title={`Sell ${asset.name}`} onClose={onClose} accent="var(--green)">
      <form onSubmit={submit} className="stack">
        <p className="muted small">Bought for {fmtC(asset.cost, settings)} on {fmtD(asset.purchase_date, settings)}. The sale price is added to your income under “Asset Sale”.</p>
        <div className="grid2">
          <Inp label="Sale price" type="number" step="0.01" min="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required autoFocus />
          <Inp label="Sale date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        {diff !== null && (
          <div className="note">{diff >= 0 ? "Gain" : "Loss"} vs purchase price: <b className={diff >= 0 ? "income" : "expense"}>{fmtC(diff, settings)}</b></div>
        )}
        {error && <div className="alert">{error}</div>}
        <button className="btn block" style={{ background: "var(--green)", color: "#fff" }} disabled={busy}>{busy ? "Saving..." : "Record sale"}</button>
      </form>
    </Modal>
  );
}

function WriteOffForm({ asset, settings, onClose, onDone }) {
  const [date, setDate] = useState(todayISO());
  const { error, busy, run } = useSubmit(onDone);
  const submit = run(() => api.post(`/api/assets/${asset.id}/writeoff`, { date }));
  return (
    <Modal title={`Write off ${asset.name}`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <p>This sets the value of <b>{asset.name}</b> ({fmtC(asset.cost, settings)}) to <b>0</b> because it can no longer be used. You can undo this later.</p>
        <Inp label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        {error && <div className="alert">{error}</div>}
        <button className="btn block" style={{ background: "var(--red)", color: "#fff" }} disabled={busy}>{busy ? "Saving..." : "Write off to 0"}</button>
      </form>
    </Modal>
  );
}
