import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import Inp from "./Inp";
import { api } from "../api";
import { fmtC, fmtD } from "../formatters";
import { openDb, listTables, readTable, detectFormat, readOwnBackup, readTrackPro, mapRows, guessColumns, isValidTx } from "../dbfile";

const CHUNK = 2000;

export default function DbImport({ file, settings, onClose, onDone }) {
  const [db, setDb] = useState(null);
  const [tables, setTables] = useState([]);
  const [format, setFormat] = useState(null);
  const [error, setError] = useState("");
  const [table, setTable] = useState("");
  const [map, setMap] = useState({ date: "", amount: "", type: "", typeMode: "column", category: "", description: "" });
  const [mode, setMode] = useState("add");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const dayFirst = !String(settings.dateFormat || "").startsWith("MM");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await openDb(await file.arrayBuffer());
        if (!alive) return;
        const t = listTables(d);
        if (!t.length) throw new Error("This database has no tables.");
        const f = detectFormat(d, t);
        setDb(d); setTables(t); setFormat(f);
        if (f === "generic") {
          // pick the table that looks most like transactions
          const best = [...t].sort((a, b) => score(b) - score(a))[0];
          chooseTable(best, d);
        }
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, [file]);

  const chooseTable = (t) => {
    setTable(t.name);
    const g = guessColumns(t.cols);
    setMap({ ...g, typeMode: g.type ? "column" : "sign" });
  };

  // build the list of transactions to import
  const { list, own } = useMemo(() => {
    if (!db || !format) return { list: [] };
    try {
      if (format === "own") { const b = readOwnBackup(db); return { list: b.transactions, own: b }; }
      if (format === "trackpro") return { list: readTrackPro(db) };
      if (!table || !map.date || !map.amount) return { list: [] };
      return { list: mapRows(readTable(db, table), map, dayFirst) };
    } catch (e) {
      return { list: [], err: e.message };
    }
  }, [db, format, table, map, dayFirst]);

  const valid = list.filter(isValidTx);
  const invalid = list.length - valid.length;
  const cols = tables.find((t) => t.name === table)?.cols || [];
  const colOpts = [{ value: "", label: "— none —" }, ...cols.map((c) => ({ value: c, label: c }))];
  const setM = (k) => (e) => setMap({ ...map, [k]: e.target.value });

  const run = async () => {
    if (mode === "replace" && !confirm(own
      ? "Replace ALL your data (transactions, categories, equipment, oil changes, settings) with this backup?"
      : "Delete all your current transactions and replace them with this file?")) return;
    setBusy(true); setError("");
    try {
      if (own && mode === "replace") {
        setProgress("Restoring backup…");
        const r = await api.post("/api/restore", own);
        await onDone(`Restored ${r.transactions} transactions from the .db backup.`);
        return;
      }
      let done = 0, skipped = 0;
      for (let i = 0; i < valid.length; i += CHUNK) {
        setProgress(`Importing ${Math.min(i + CHUNK, valid.length)} of ${valid.length}…`);
        const r = await api.post("/api/import", { mode: i === 0 ? mode : "add", transactions: valid.slice(i, i + CHUNK) });
        done += r.imported; skipped += r.skipped;
      }
      await onDone(`Imported ${done} transactions${skipped + invalid ? ` (${skipped + invalid} rows skipped)` : ""}.`);
    } catch (e) {
      setError(e.message); setBusy(false); setProgress("");
    }
  };

  return (
    <Modal title="Import .db file" onClose={busy ? () => {} : onClose}>
      <div className="stack">
        <p className="muted small">File: <b>{file.name}</b> ({(file.size / 1024).toFixed(0)} KB). It is read on this phone — the file itself is not uploaded.</p>
        {!db && !error && <div className="note">Opening database…</div>}

        {format === "own" && <div className="note">This is a <b>Service Tracker .db backup</b> with {own?.transactions.length} transactions, {own?.assets?.length || 0} equipment items and {own?.oilChanges?.length || 0} oil changes.</div>}
        {format === "trackpro" && <div className="note">Recognised the <b>Track Pro</b> database format.</div>}

        {format === "generic" && (
          <>
            <Inp label="Table with your transactions" value={table}
              onChange={(e) => chooseTable(tables.find((t) => t.name === e.target.value))}
              options={tables.map((t) => ({ value: t.name, label: `${t.name} (${t.count} rows)` }))} />
            <div className="grid2">
              <Inp label="Date column *" value={map.date} onChange={setM("date")} options={colOpts} />
              <Inp label="Amount column *" value={map.amount} onChange={setM("amount")} options={colOpts} />
            </div>
            <div className="grid2">
              <Inp label="Income or expense" value={map.typeMode} onChange={setM("typeMode")} options={[
                { value: "column", label: "From a column" },
                { value: "sign", label: "Negative amount = expense" },
                { value: "income", label: "All are income" },
                { value: "expense", label: "All are expenses" },
              ]} />
              {map.typeMode === "column"
                ? <Inp label="Type column" value={map.type} onChange={setM("type")} options={colOpts} />
                : <div />}
            </div>
            <div className="grid2">
              <Inp label="Category column" value={map.category} onChange={setM("category")} options={colOpts} />
              <Inp label="Description column" value={map.description} onChange={setM("description")} options={colOpts} />
            </div>
          </>
        )}

        {list.length > 0 && (
          <>
            <div className="field-label">Preview</div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th></tr></thead>
                <tbody>
                  {list.slice(0, 5).map((t, i) => (
                    <tr key={i} className={isValidTx(t) ? "" : "bad-row"}>
                      <td>{t.date ? fmtD(t.date, settings) : "?"}</td>
                      <td className={t.type}>{t.type}</td>
                      <td>{t.category}</td>
                      <td>{Number.isFinite(t.amount) ? fmtC(t.amount, settings) : "?"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small"><b>{valid.length}</b> transactions ready{invalid ? <span className="expense"> · {invalid} rows will be skipped (missing date or amount)</span> : null}</p>

            <div className="seg">
              <button type="button" className={mode === "add" ? "on" : ""} onClick={() => setMode("add")}>Add to my data</button>
              <button type="button" className={mode === "replace" ? "on" : ""} onClick={() => setMode("replace")}>{own ? "Replace everything" : "Replace transactions"}</button>
            </div>
          </>
        )}
        {format === "generic" && db && list.length === 0 && <div className="note">Choose the date and amount columns to see a preview.</div>}

        {error && <div className="alert">{error}</div>}
        {progress && <div className="note">{progress}</div>}
        <button className="btn primary block" disabled={busy || !valid.length} onClick={run}>
          {busy ? "Working…" : `Import ${valid.length || ""} transactions`}
        </button>
      </div>
    </Modal>
  );
}

function score(t) {
  const c = t.cols.join(" ").toLowerCase();
  return (/amount|value|total|price/.test(c) ? 10 : 0) + (/date|time/.test(c) ? 10 : 0) + (/trans|entr|record|expense|income/.test(t.name.toLowerCase()) ? 5 : 0) + Math.min(t.count, 1000) / 1000;
}
