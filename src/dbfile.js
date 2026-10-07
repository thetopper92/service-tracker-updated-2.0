// Read and write SQLite .db files in the browser (sql.js). Loaded only when needed.
let SQLp = null;
async function getSQL() {
  if (!SQLp) {
    SQLp = (async () => {
      const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
        import("sql.js"),
        import("sql.js/dist/sql-wasm.wasm?url"),
      ]);
      return initSqlJs({ locateFile: () => wasmUrl });
    })();
    SQLp.catch(() => { SQLp = null; });
  }
  return SQLp;
}

export async function openDb(arrayBuffer) {
  const SQL = await getSQL();
  let db;
  try {
    db = new SQL.Database(new Uint8Array(arrayBuffer));
    db.exec("SELECT name FROM sqlite_master LIMIT 1");
  } catch {
    throw new Error("This file is not a readable SQLite .db database.");
  }
  return db;
}

export function rows(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

const qi = (name) => `"${String(name).replace(/"/g, '""')}"`;
export function listTables(db) {
  return rows(db, "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => {
    const cols = rows(db, `PRAGMA table_info(${qi(t.name)})`).map((c) => c.name);
    let count = 0;
    try { count = rows(db, `SELECT COUNT(*) AS n FROM ${qi(t.name)}`)[0].n; } catch { /* ignore */ }
    return { name: t.name, cols, count };
  });
}
export const readTable = (db, name, limit) => rows(db, `SELECT * FROM ${qi(name)}${limit ? ` LIMIT ${Number(limit)}` : ""}`);

// ---------- value conversion ----------
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseDate(v, dayFirst = true) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" || /^\d{9,13}(\.\d+)?$/.test(String(v).trim())) {
    const n = Number(v);
    if (n > 1e12) return isoOf(new Date(n));          // milliseconds
    if (n > 1e9) return isoOf(new Date(n * 1000));    // seconds
    if (n > 20000 && n < 80000) return isoOf(new Date(Date.UTC(1899, 11, 30) + n * 86400000)); // spreadsheet day number
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    if (y < 100) y += 2000;
    let d, mo;
    if (a > 12) { d = a; mo = b; } else if (b > 12) { d = b; mo = a; } else if (dayFirst) { d = a; mo = b; } else { d = b; mo = a; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : isoOf(new Date(t));
}

export function parseAmount(v) {
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim().replace(/[^\d.,\-()]/g, "");
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()-]/g, "");
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else s = s.replace(/,/g, "");                                          // 1,234.56
  const n = parseFloat(s);
  return neg ? -n : n;
}

export function parseType(v, amount) {
  const s = String(v ?? "").trim().toLowerCase();
  if (/^(income|in|credit|cr|earning|earnings|revenue|sale|sales|deposit|received|\+|1|true)$/.test(s) || s.startsWith("inc")) return "income";
  if (/^(expense|expenses|out|debit|dr|spend|spending|cost|withdrawal|payment|-|0|false)$/.test(s) || s.startsWith("exp")) return "expense";
  return amount < 0 ? "expense" : "income";
}

// guess which column holds what, from its name
export function guessColumns(cols) {
  const find = (re) => cols.find((c) => re.test(c)) || "";
  return {
    date: find(/date|time|day|created|when/i),
    amount: find(/amount|amt|value|total|price|sum|money/i),
    type: find(/^type$|kind|direction|in_out|income_expense|is_income|category_type/i),
    category: find(/category_name|category|cat|group|account|head/i),
    description: find(/note|desc|memo|detail|comment|remark|title|name/i),
  };
}

// ---------- known formats ----------
export function detectFormat(db, tables) {
  const names = tables.map((t) => t.name.toLowerCase());
  if (names.includes("st_meta")) {
    const meta = Object.fromEntries(rows(db, "SELECT key, value FROM st_meta").map((r) => [r.key, r.value]));
    if (meta.app === "ServiceTracker") return "own";
  }
  const tx = tables.find((t) => t.name.toLowerCase() === "transactions");
  const cats = tables.find((t) => t.name.toLowerCase() === "categories");
  if (tx && cats && tx.cols.includes("category_id") && tx.cols.includes("amount") && cats.cols.includes("name")) return "trackpro";
  return "generic";
}

// This app's own .db backup -> backup object (same shape as the JSON backup)
export function readOwnBackup(db) {
  const get = (t) => { try { return readTable(db, t); } catch { return []; } };
  const settingsRow = get("settings")[0];
  return {
    app: "ServiceTracker", version: 2,
    settings: settingsRow ? JSON.parse(settingsRow.json) : undefined,
    categories: get("categories"),
    transactions: get("transactions").map((t) => ({ ...t, unpaid: !!t.unpaid })),
    assets: get("assets"),
    oilChanges: get("oil_changes"),
  };
}

// The old "Track Pro" finance.db (transactions + categories with ids)
export function readTrackPro(db) {
  const cats = Object.fromEntries(readTable(db, "categories").map((c) => [c.id, c.name]));
  return readTable(db, "transactions").map((t) => ({
    type: parseType(t.type, Number(t.amount)),
    amount: Math.abs(parseAmount(t.amount)),
    category: cats[t.category_id] || "Imported",
    date: parseDate(t.date),
    description: [t.notes, t.tags].filter(Boolean).join(" · "),
  }));
}

// Any other database: user picks the table and which column is what
export function mapRows(list, map, dayFirst) {
  return list.map((r) => {
    const raw = parseAmount(r[map.amount]);
    let type;
    if (map.typeMode === "income" || map.typeMode === "expense") type = map.typeMode;
    else if (map.typeMode === "sign") type = raw < 0 ? "expense" : "income";
    else type = parseType(r[map.type], raw);
    const category = map.category ? String(r[map.category] ?? "").trim() : "";
    return {
      type,
      amount: Math.abs(raw),
      category: category || "Imported",
      date: parseDate(r[map.date], dayFirst),
      description: map.description ? String(r[map.description] ?? "").trim().slice(0, 500) : "",
    };
  });
}

export const isValidTx = (t) => t.date && Number.isFinite(t.amount) && t.amount > 0 && (t.type === "income" || t.type === "expense");

// ---------- export this app's data as a .db file ----------
export async function buildDb(backup) {
  const SQL = await getSQL();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE st_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE settings (json TEXT);
    CREATE TABLE categories (type TEXT, name TEXT, color TEXT);
    CREATE TABLE transactions (type TEXT, category TEXT, amount REAL, date TEXT, description TEXT, unpaid INTEGER);
    CREATE TABLE assets (name TEXT, category TEXT, cost REAL, purchase_date TEXT, notes TEXT, status TEXT, sale_price REAL, end_date TEXT);
    CREATE TABLE oil_changes (date TEXT, odometer TEXT, notes TEXT);
  `);
  const ins = (sql, list, f) => { const st = db.prepare(sql); list.forEach((x) => st.run(f(x))); st.free(); };
  ins("INSERT INTO st_meta VALUES (?, ?)", [["app", "ServiceTracker"], ["version", "2"], ["exportedAt", new Date().toISOString()]], (x) => x);
  ins("INSERT INTO settings VALUES (?)", [backup.settings || {}], (x) => [JSON.stringify(x)]);
  ins("INSERT INTO categories VALUES (?,?,?)", backup.categories || [], (c) => [c.type, c.name, c.color || null]);
  ins("INSERT INTO transactions VALUES (?,?,?,?,?,?)", backup.transactions || [], (t) => [t.type, t.category, t.amount, t.date, t.description || "", t.unpaid ? 1 : 0]);
  ins("INSERT INTO assets VALUES (?,?,?,?,?,?,?,?)", backup.assets || [], (a) => [a.name, a.category || "", a.cost, a.purchase_date, a.notes || "", a.status, a.sale_price ?? null, a.end_date ?? null]);
  ins("INSERT INTO oil_changes VALUES (?,?,?)", backup.oilChanges || [], (o) => [o.date, o.odometer || "", o.notes || ""]);
  const bytes = db.export();
  db.close();
  return bytes;
}
