import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import Inp from "./Inp";
import { api } from "../api";
import { fmtC, fmtD } from "../formatters";
import {
  openDb, listTables, detectFormat, readOwnBackup, readTrackPro, convertSource, guessColumns,
  guessSeparateTables, distinctValues, autoValueMap, isValidTx,
} from "../dbfile";

const CHUNK = 2000;
const MODES = [
  { value: "column", label: "A column says if it's income or expense" },
  { value: "twocols", label: "Separate money-in and money-out columns" },
  { value: "tables", label: "Separate tables for income and expenses" },
  { value: "sign", label: "Negative amounts are expenses" },
  { value: "income", label: "Everything is income" },
  { value: "expense", label: "Everything is an expense" },
];

export default function DbImport({ file, settings, onClose, onDone }) {
  const [db, setDb] = useState(null);
  const [tables, setTables] = useState([]);
  const [format, setFormat] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("column");
  const [src, setSrc] = useState(null);       // single-table settings
  const [incSrc, setIncSrc] = useState(null); // "tables" mode
  const [expSrc, setExpSrc] = useState(null);
  const [importMode, setImportMode] = useState("add");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const dayFirst = !String(settings.dateFormat || "").startsWith("MM");

  const setupFor = (d, t, fixed) => {
    const g = guessColumns(t.cols, d, t.name);
    return { ...g, table: t.name, mode: fixed || g.mode };
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await openDb(await file.arrayBuffer());
        if (!alive) return;
        const t = listTables(d).filter((x) => x.count > 0);
        if (!t.length) throw new Error("This database has no tables with data.");
        const f = detectFormat(d, t);
        setDb(d); setTables(t); setFormat(f);
        if (f !== "generic") return;
        const sep = guessSeparateTables(t);
        const best = [...t].sort((a, b) => score(b) - score(a))[0];
        const single = setupFor(d, best);
        setSrc(single);
        if (sep) {
          setIncSrc(setupFor(d, sep.inc, "income"));
          setExpSrc(setupFor(d, sep.exp, "expense"));
          setMode("tables");
        } else {
          setMode(single.mode);
          const other = t.find((x) => x.name !== best.name) || best;
          setIncSrc(setupFor(d, best, "income"));
          setExpSrc(setupFor(d, other, "expense"));
        }
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, [file]);

  // transactions that will be imported
  const { list, own } = useMemo(() => {
    if (!db || !format) return { list: [] };
    try {
      if (format === "own") { const b = readOwnBackup(db); return { list: b.transactions, own: b }; }
      if (format === "trackpro") return { list: readTrackPro(db) };
      if (mode === "tables") return { list: [...convertSource(db, incSrc, dayFirst), ...convertSource(db, expSrc, dayFirst)] };
      if (!src) return { list: [] };
      return { list: convertSource(db, { ...src, mode }, dayFirst) };
    } catch (e) {
      return { list: [], err: e.message };
    }
  }, [db, format, mode, src, incSrc, expSrc, dayFirst]);

  const valid = list.filter(isValidTx);
  const inc = valid.filter((t) => t.type === "income");
  const exp = valid.filter((t) => t.type === "expense");
  const undecided = list.filter((t) => t.type === "unknown").length;
  const skipped = list.length - valid.length - undecided;
  const sum = (l) => l.reduce((s, t) => s + t.amount, 0);
  const oneSided = valid.length > 0 && (inc.length === 0 || exp.length === 0) && mode !== "income" && mode !== "expense";

  const run = async () => {
    if (undecided) { setError(`Choose Income or Expense for every value in the list (${undecided} rows not decided yet).`); return; }
    if (oneSided && !confirm(`Only ${inc.length ? "income" : "expenses"} found — nothing will be imported as ${inc.length ? "expenses" : "income"}. Import anyway?`)) return;
    if (importMode === "replace" && !confirm(own
      ? "Replace ALL your data (transactions, categories, equipment, oil changes, settings) with this backup?"
      : "Delete all your current transactions and replace them with this file?")) return;
    setBusy(true); setError("");
    try {
      if (own && importMode === "replace") {
        setProgress("Restoring backup…");
        const r = await api.post("/api/restore", own);
        await onDone(`Restored ${r.transactions} transactions from the .db backup.`);
        return;
      }
      let done = 0;
      for (let i = 0; i < valid.length; i += CHUNK) {
        setProgress(`Importing ${Math.min(i + CHUNK, valid.length)} of ${valid.length}…`);
        const r = await api.post("/api/import", { mode: i === 0 ? importMode : "add", transactions: valid.slice(i, i + CHUNK) });
        done += r.imported;
      }
      await onDone(`Imported ${done} transactions: ${inc.length} income and ${exp.length} expenses${skipped ? ` (${skipped} rows skipped)` : ""}.`);
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

        {format === "generic" && src && (
          <>
            <Inp label="How are income and expenses marked in this file?" value={mode} onChange={(e) => setMode(e.target.value)} options={MODES} />

            {mode === "tables" ? (
              <>
                <SourceEditor title="Income table" color="income" db={db} tables={tables} src={incSrc} onChange={setIncSrc} fixed="income" />
                <SourceEditor title="Expense table" color="expense" db={db} tables={tables} src={expSrc} onChange={setExpSrc} fixed="expense" />
              </>
            ) : (
              <SourceEditor db={db} tables={tables} src={{ ...src, mode }} onChange={(s) => setSrc({ ...s })} />
            )}
          </>
        )}

        {list.length > 0 && (
          <>
            <div className="import-summary">
              <div className="kv"><span className="muted small">Income</span><b className="income">{inc.length}</b><span className="small">{fmtC(sum(inc), settings)}</span></div>
              <div className="kv"><span className="muted small">Expenses</span><b className="expense">{exp.length}</b><span className="small">{fmtC(sum(exp), settings)}</span></div>
              <div className="kv"><span className="muted small">Skipped</span><b>{skipped + undecided}</b><span className="small muted">{undecided ? `${undecided} not decided` : "no date/amount"}</span></div>
            </div>
            {oneSided && (
              <div className="alert">
                Everything will be imported as <b>{inc.length ? "income" : "expenses"}</b>. If your file also has {inc.length ? "expenses" : "income"}, change how they're marked above.
              </div>
            )}

            <div className="field-label">Preview</div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th></tr></thead>
                <tbody>
                  {[...inc.slice(0, 3), ...exp.slice(0, 3), ...list.filter((t) => !isValidTx(t)).slice(0, 2)].map((t, i) => (
                    <tr key={i} className={isValidTx(t) ? "" : "bad-row"}>
                      <td>{t.date ? fmtD(t.date, settings) : "?"}</td>
                      <td className={t.type}>{t.type === "unknown" ? "?" : t.type}</td>
                      <td>{t.category}</td>
                      <td>{Number.isFinite(t.amount) ? fmtC(t.amount, settings) : "?"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="seg">
              <button type="button" className={importMode === "add" ? "on" : ""} onClick={() => setImportMode("add")}>Add to my data</button>
              <button type="button" className={importMode === "replace" ? "on" : ""} onClick={() => setImportMode("replace")}>{own ? "Replace everything" : "Replace transactions"}</button>
            </div>
          </>
        )}
        {format === "generic" && db && list.length === 0 && <div className="note">Choose the date and amount columns to see a preview.</div>}

        {error && <div className="alert">{error}</div>}
        {progress && <div className="note">{progress}</div>}
        {undecided > 0 && <div className="note">Choose <b>Income</b>, <b>Expense</b> or <b>Skip</b> for each value highlighted above ({undecided} rows waiting).</div>}
        <button className="btn primary block" disabled={busy || (!valid.length && !undecided)} onClick={run}>
          {busy ? "Working…" : `Import ${valid.length || ""} transactions`}
        </button>
      </div>
    </Modal>
  );
}

// Column settings for one table (plus value mapping when a column says income/expense)
function SourceEditor({ title, color, db, tables, src, onChange, fixed }) {
  if (!src) return null;
  const t = tables.find((x) => x.name === src.table) || tables[0];
  const colOpts = [{ value: "", label: "— none —" }, ...t.cols.map((c) => ({ value: c, label: c }))];
  const set = (k) => (e) => onChange({ ...src, [k]: e.target.value });
  const mode = fixed || src.mode;

  const chooseTable = (name) => {
    const nt = tables.find((x) => x.name === name);
    const g = guessColumns(nt.cols, db, nt.name);
    onChange({ ...g, table: nt.name, mode: fixed || src.mode });
  };
  const chooseTypeCol = (col) => onChange({ ...src, typeCol: col, valueMap: autoValueMap(distinctValues(db, src.table, col)) });

  const values = mode === "column" && src.typeCol ? distinctValues(db, src.table, src.typeCol) : [];
  const setValue = (v, type) => onChange({ ...src, valueMap: { ...src.valueMap, [v]: type } });

  return (
    <div className={`source-box ${color || ""}`}>
      {title && <div className="source-title">{title}</div>}
      <Inp label="Table" value={src.table} onChange={(e) => chooseTable(e.target.value)}
        options={tables.map((x) => ({ value: x.name, label: `${x.name} (${x.count} rows)` }))} />
      <div className="grid2">
        <Inp label="Date column *" value={src.date} onChange={set("date")} options={colOpts} />
        {mode === "twocols"
          ? <div />
          : <Inp label="Amount column *" value={src.amount} onChange={set("amount")} options={colOpts} />}
      </div>
      {mode === "twocols" && (
        <div className="grid2">
          <Inp label="Money IN column (income) *" value={src.inCol} onChange={set("inCol")} options={colOpts} />
          <Inp label="Money OUT column (expense) *" value={src.outCol} onChange={set("outCol")} options={colOpts} />
        </div>
      )}
      {mode === "column" && (
        <>
          <Inp label="Column that says income or expense *" value={src.typeCol} onChange={(e) => chooseTypeCol(e.target.value)} options={colOpts} />
          {values.length > 0 && (
            <div className="value-map">
              <div className="field-label">What does each value mean?</div>
              {values.map((v) => {
                const cur = src.valueMap?.[v.value] || "";
                return (
                  <div key={v.value} className={`value-row ${cur ? "" : "undecided"}`}>
                    <span className="grow"><b>{v.value || "(empty)"}</b> <span className="muted small">{v.count} row{v.count === 1 ? "" : "s"}</span></span>
                    <div className="seg small">
                      <button type="button" className={cur === "income" ? "on income" : ""} onClick={() => setValue(v.value, "income")}>Income</button>
                      <button type="button" className={cur === "expense" ? "on expense" : ""} onClick={() => setValue(v.value, "expense")}>Expense</button>
                      <button type="button" className={cur === "skip" ? "on" : ""} onClick={() => setValue(v.value, "skip")}>Skip</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      <div className="grid2">
        <Inp label="Category column" value={src.category} onChange={set("category")} options={colOpts} />
        <Inp label="Description column" value={src.description} onChange={set("description")} options={colOpts} />
      </div>
    </div>
  );
}

function score(t) {
  const c = t.cols.join(" ").toLowerCase();
  return (/amount|value|total|price|cash|credit|debit/.test(c) ? 10 : 0) + (/date|time/.test(c) ? 10 : 0) +
    (/trans|entr|record|expense|income|book|ledger/.test(t.name.toLowerCase()) ? 5 : 0) + Math.min(t.count, 1000) / 1000;
}
