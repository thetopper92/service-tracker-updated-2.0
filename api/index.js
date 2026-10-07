// Service Tracker 2.0 — backend API
// Runs as a Vercel serverless function (see vercel.json). Locally, server.js imports it.
import express from "express";
import cookieSession from "cookie-session";
import crypto from "crypto";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash("sha256").update("ft-session:" + DATABASE_URL).digest("hex");

const DEFAULT_CATS = {
  income: ["Sales", "Freelance", "Investment", "Rental", "Other Income"],
  expense: ["Rent", "Salaries", "Marketing", "Utilities", "Travel", "Software", "Other Expense"],
};
const COLORS = ["#4F8EF7", "#34C97B", "#F7B731", "#E05C5C", "#9B59B6", "#1ABC9C", "#E67E22", "#2ECC71", "#3498DB", "#E91E63"];
const DEFAULT_SETTINGS = {
  currency: "$", currencyPos: "before", dateFormat: "YYYY-MM-DD",
  language: "en", decimalSep: ".", thousandSep: ",", showCents: true, defaultTab: "dashboard", theme: "light",
  investAmount: 0, investDate: "", investIncludeEquip: true,
};
const BOOL_SETTINGS = ["showCents", "investIncludeEquip"];
const NUM_SETTINGS = ["investAmount"];

// ---------- Database ----------
let pool = null;
function getPool() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!pool) {
    const local = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 3,
      ssl: local || /sslmode=/.test(DATABASE_URL) ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}
const q = async (text, params = []) => (await getPool().query(text, params)).rows;

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS ft_users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          pass_hash TEXT NOT NULL,
          hint_q TEXT NOT NULL,
          hint_a_hash TEXT NOT NULL,
          settings JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS ft_categories (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES ft_users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('income','expense')),
          name TEXT NOT NULL,
          color TEXT,
          UNIQUE (user_id, type, name)
        );
        CREATE TABLE IF NOT EXISTS ft_transactions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES ft_users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('income','expense')),
          category TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          date TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ft_tx_user_date ON ft_transactions (user_id, date);
        CREATE TABLE IF NOT EXISTS ft_assets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES ft_users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          category TEXT,
          cost DOUBLE PRECISION NOT NULL,
          purchase_date TEXT NOT NULL,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','written_off')),
          sale_price DOUBLE PRECISION,
          end_date TEXT,
          income_tx_id INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `)
      .then(() => undefined)
      .catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

// ---------- Password hashing (scrypt) ----------
function hash(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${key}`;
}
function verify(secret, stored) {
  const [salt, key] = String(stored).split(":");
  if (!salt || !key) return false;
  const test = crypto.scryptSync(secret, salt, 64);
  const real = Buffer.from(key, "hex");
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}
const normAnswer = (a) => String(a || "").trim().toLowerCase();
const normEmail = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---------- Validation helpers ----------
const isType = (t) => t === "income" || t === "expense";
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
function cleanTx(b) {
  const amount = Number(b.amount);
  if (!isType(b.type)) return { error: "Type must be income or expense." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be greater than 0." };
  if (!String(b.category || "").trim()) return { error: "Category is required." };
  if (!isDate(b.date)) return { error: "Date is required." };
  return {
    type: b.type,
    amount: Math.round(amount * 100) / 100,
    category: String(b.category).trim().slice(0, 100),
    date: b.date,
    description: String(b.description || "").trim().slice(0, 500),
  };
}
function cleanSettings(s = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (s[k] === undefined) continue;
    if (BOOL_SETTINGS.includes(k)) out[k] = s[k] === true || s[k] === "true";
    else if (NUM_SETTINGS.includes(k)) {
      const n = Number(s[k]);
      out[k] = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
    } else if (k === "investDate") out[k] = isDate(s[k]) ? s[k] : "";
    else out[k] = String(s[k]).slice(0, 20);
  }
  return out;
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, settings: cleanSettings(u.settings) });

// ---------- App ----------
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "5mb" }));
app.use(
  cookieSession({
    name: "ft_session",
    keys: [SESSION_SECRET],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
  })
);

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Server error. Please try again." });
  });

app.get("/api/health", (req, res) => res.json({ ok: true, database: !!DATABASE_URL }));

app.use("/api", async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database not available. " + (err?.message || "") });
  }
});

const auth = (req, res, next) => {
  if (!req.session?.uid) return res.status(401).json({ error: "Please log in." });
  next();
};

// ----- Auth -----
app.post("/api/auth/signup", wrap(async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  const email = normEmail(req.body.email);
  const password = String(req.body.password || "");
  const hintQ = String(req.body.hintQ || "").trim().slice(0, 200);
  const hintA = normAnswer(req.body.hintA);
  if (!name) return res.status(400).json({ error: "Name is required." });
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (!hintQ || !hintA) return res.status(400).json({ error: "Security question and answer are required." });

  const exists = await q("SELECT 1 FROM ft_users WHERE email = $1", [email]);
  if (exists.length) return res.status(409).json({ error: "An account with this email already exists." });

  const rows = await q(
    "INSERT INTO ft_users (name, email, pass_hash, hint_q, hint_a_hash, settings) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [name, email, hash(password), hintQ, hash(hintA), JSON.stringify(DEFAULT_SETTINGS)]
  );
  const user = rows[0];
  let i = 0;
  for (const type of ["income", "expense"]) {
    for (const cat of DEFAULT_CATS[type]) {
      await q("INSERT INTO ft_categories (user_id, type, name, color) VALUES ($1,$2,$3,$4)", [user.id, type, cat, COLORS[i++ % COLORS.length]]);
    }
  }
  req.session.uid = user.id;
  res.json({ user: publicUser(user) });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password || "");
  const rows = await q("SELECT * FROM ft_users WHERE email = $1", [email]);
  if (!rows[0] || !verify(password, rows[0].pass_hash)) {
    await new Promise((r) => setTimeout(r, 400));
    return res.status(401).json({ error: "Wrong email or password." });
  }
  req.session.uid = rows[0].id;
  res.json({ user: publicUser(rows[0]) });
}));

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get("/api/auth/me", wrap(async (req, res) => {
  if (!req.session?.uid) return res.json({ user: null });
  const rows = await q("SELECT * FROM ft_users WHERE id = $1", [req.session.uid]);
  if (!rows[0]) { req.session = null; return res.json({ user: null }); }
  res.json({ user: publicUser(rows[0]) });
}));

app.post("/api/auth/forgot/question", wrap(async (req, res) => {
  const rows = await q("SELECT hint_q FROM ft_users WHERE email = $1", [normEmail(req.body.email)]);
  if (!rows[0]) return res.status(404).json({ error: "No account found with this email." });
  res.json({ question: rows[0].hint_q });
}));

app.post("/api/auth/forgot/reset", wrap(async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.newPassword || "");
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const rows = await q("SELECT * FROM ft_users WHERE email = $1", [email]);
  if (!rows[0] || !verify(normAnswer(req.body.answer), rows[0].hint_a_hash)) {
    await new Promise((r) => setTimeout(r, 400));
    return res.status(401).json({ error: "The answer is not correct." });
  }
  await q("UPDATE ft_users SET pass_hash = $1 WHERE id = $2", [hash(password), rows[0].id]);
  req.session.uid = rows[0].id;
  res.json({ user: publicUser(rows[0]) });
}));

app.put("/api/auth/password", auth, wrap(async (req, res) => {
  const rows = await q("SELECT * FROM ft_users WHERE id = $1", [req.session.uid]);
  if (!rows[0] || !verify(String(req.body.current || ""), rows[0].pass_hash)) {
    return res.status(401).json({ error: "Current password is not correct." });
  }
  const next = String(req.body.next || "");
  if (next.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters." });
  await q("UPDATE ft_users SET pass_hash = $1 WHERE id = $2", [hash(next), req.session.uid]);
  res.json({ ok: true });
}));

// ----- Settings -----
app.put("/api/settings", auth, wrap(async (req, res) => {
  const settings = cleanSettings(req.body || {});
  await q("UPDATE ft_users SET settings = $1 WHERE id = $2", [JSON.stringify(settings), req.session.uid]);
  res.json({ settings });
}));

// ----- Categories -----
app.get("/api/categories", auth, wrap(async (req, res) => {
  res.json(await q("SELECT id, type, name, color FROM ft_categories WHERE user_id = $1 ORDER BY type, id", [req.session.uid]));
}));

app.post("/api/categories", auth, wrap(async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 100);
  if (!isType(req.body.type) || !name) return res.status(400).json({ error: "Name and type are required." });
  const color = String(req.body.color || COLORS[Math.floor(Math.random() * COLORS.length)]).slice(0, 20);
  try {
    const rows = await q("INSERT INTO ft_categories (user_id, type, name, color) VALUES ($1,$2,$3,$4) RETURNING id, type, name, color",
      [req.session.uid, req.body.type, name, color]);
    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "That category already exists." });
    throw e;
  }
}));

app.put("/api/categories/:id", auth, wrap(async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: "Name is required." });
  const old = await q("SELECT * FROM ft_categories WHERE id = $1 AND user_id = $2", [Number(req.params.id), req.session.uid]);
  if (!old[0]) return res.status(404).json({ error: "Category not found." });
  const color = String(req.body.color || old[0].color || "").slice(0, 20);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE ft_categories SET name = $1, color = $2 WHERE id = $3", [name, color, old[0].id]);
    if (name !== old[0].name) {
      await client.query("UPDATE ft_transactions SET category = $1 WHERE user_id = $2 AND type = $3 AND category = $4",
        [name, req.session.uid, old[0].type, old[0].name]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if (e.code === "23505") return res.status(409).json({ error: "That category already exists." });
    throw e;
  } finally {
    client.release();
  }
  res.json({ id: old[0].id, type: old[0].type, name, color });
}));

app.delete("/api/categories/:id", auth, wrap(async (req, res) => {
  const cat = await q("SELECT * FROM ft_categories WHERE id = $1 AND user_id = $2", [Number(req.params.id), req.session.uid]);
  if (!cat[0]) return res.status(404).json({ error: "Category not found." });
  const used = await q("SELECT COUNT(*)::int AS n FROM ft_transactions WHERE user_id = $1 AND type = $2 AND category = $3",
    [req.session.uid, cat[0].type, cat[0].name]);
  if (used[0].n > 0) return res.status(400).json({ error: `This category is used by ${used[0].n} transaction(s). Rename it or move those first.` });
  await q("DELETE FROM ft_categories WHERE id = $1", [cat[0].id]);
  res.json({ ok: true });
}));

// ----- Transactions -----
app.get("/api/transactions", auth, wrap(async (req, res) => {
  res.json(await q("SELECT id, type, category, amount, date, description FROM ft_transactions WHERE user_id = $1 ORDER BY date DESC, id DESC",
    [req.session.uid]));
}));

app.post("/api/transactions", auth, wrap(async (req, res) => {
  const t = cleanTx(req.body || {});
  if (t.error) return res.status(400).json(t);
  const rows = await q(
    "INSERT INTO ft_transactions (user_id, type, category, amount, date, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, type, category, amount, date, description",
    [req.session.uid, t.type, t.category, t.amount, t.date, t.description]
  );
  res.json(rows[0]);
}));

app.put("/api/transactions/:id", auth, wrap(async (req, res) => {
  const t = cleanTx(req.body || {});
  if (t.error) return res.status(400).json(t);
  const rows = await q(
    "UPDATE ft_transactions SET type=$1, category=$2, amount=$3, date=$4, description=$5 WHERE id=$6 AND user_id=$7 RETURNING id, type, category, amount, date, description",
    [t.type, t.category, t.amount, t.date, t.description, Number(req.params.id), req.session.uid]
  );
  if (!rows[0]) return res.status(404).json({ error: "Transaction not found." });
  await q("UPDATE ft_assets SET sale_price = $1, end_date = $2 WHERE income_tx_id = $3 AND user_id = $4",
    [t.amount, t.date, rows[0].id, req.session.uid]);
  res.json(rows[0]);
}));

app.delete("/api/transactions/:id", auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await q("DELETE FROM ft_transactions WHERE id = $1 AND user_id = $2", [id, req.session.uid]);
  // Deleting an asset's sale income puts the asset back to "in use"
  await q("UPDATE ft_assets SET status = 'active', sale_price = NULL, end_date = NULL, income_tx_id = NULL WHERE income_tx_id = $1 AND user_id = $2",
    [id, req.session.uid]);
  res.json({ ok: true });
}));

// ----- Equipment & assets -----
const ASSET_COLS = "id, name, category, cost, purchase_date, notes, status, sale_price, end_date, income_tx_id";
const SALE_CATEGORY = "Asset Sale";
function cleanAsset(b) {
  const cost = Number(b.cost);
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name) return { error: "Name is required." };
  if (!Number.isFinite(cost) || cost < 0) return { error: "Cost must be 0 or more." };
  if (!isDate(b.purchase_date)) return { error: "Purchase date is required." };
  return {
    name, cost: Math.round(cost * 100) / 100, purchase_date: b.purchase_date,
    category: String(b.category || "").trim().slice(0, 60),
    notes: String(b.notes || "").trim().slice(0, 500),
  };
}
const getAsset = async (id, uid) => (await q(`SELECT ${ASSET_COLS} FROM ft_assets WHERE id = $1 AND user_id = $2`, [Number(id), uid]))[0];

app.get("/api/assets", auth, wrap(async (req, res) => {
  res.json(await q(`SELECT ${ASSET_COLS} FROM ft_assets WHERE user_id = $1 ORDER BY purchase_date DESC, id DESC`, [req.session.uid]));
}));

app.post("/api/assets", auth, wrap(async (req, res) => {
  const a = cleanAsset(req.body || {});
  if (a.error) return res.status(400).json(a);
  const rows = await q(
    `INSERT INTO ft_assets (user_id, name, category, cost, purchase_date, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${ASSET_COLS}`,
    [req.session.uid, a.name, a.category, a.cost, a.purchase_date, a.notes]
  );
  res.json(rows[0]);
}));

app.put("/api/assets/:id", auth, wrap(async (req, res) => {
  const a = cleanAsset(req.body || {});
  if (a.error) return res.status(400).json(a);
  const rows = await q(
    `UPDATE ft_assets SET name=$1, category=$2, cost=$3, purchase_date=$4, notes=$5 WHERE id=$6 AND user_id=$7 RETURNING ${ASSET_COLS}`,
    [a.name, a.category, a.cost, a.purchase_date, a.notes, Number(req.params.id), req.session.uid]
  );
  if (!rows[0]) return res.status(404).json({ error: "Asset not found." });
  res.json(rows[0]);
}));

app.post("/api/assets/:id/sell", auth, wrap(async (req, res) => {
  const uid = req.session.uid;
  const asset = await getAsset(req.params.id, uid);
  if (!asset) return res.status(404).json({ error: "Asset not found." });
  if (asset.status !== "active") return res.status(400).json({ error: "This item is already sold or written off." });
  const price = Number(req.body.price);
  if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: "Sale price must be greater than 0." });
  if (!isDate(req.body.date)) return res.status(400).json({ error: "Sale date is required." });
  const amount = Math.round(price * 100) / 100;
  await q(`INSERT INTO ft_categories (user_id, type, name, color) VALUES ($1,'income',$2,'#1ABC9C') ON CONFLICT (user_id, type, name) DO NOTHING`, [uid, SALE_CATEGORY]);
  const tx = (await q(
    "INSERT INTO ft_transactions (user_id, type, category, amount, date, description) VALUES ($1,'income',$2,$3,$4,$5) RETURNING id, type, category, amount, date, description",
    [uid, SALE_CATEGORY, amount, req.body.date, `Sold: ${asset.name}`]
  ))[0];
  const rows = await q(
    `UPDATE ft_assets SET status='sold', sale_price=$1, end_date=$2, income_tx_id=$3 WHERE id=$4 RETURNING ${ASSET_COLS}`,
    [amount, req.body.date, tx.id, asset.id]
  );
  res.json({ asset: rows[0], transaction: tx });
}));

app.post("/api/assets/:id/writeoff", auth, wrap(async (req, res) => {
  const asset = await getAsset(req.params.id, req.session.uid);
  if (!asset) return res.status(404).json({ error: "Asset not found." });
  if (asset.status !== "active") return res.status(400).json({ error: "This item is already sold or written off." });
  const date = isDate(req.body.date) ? req.body.date : new Date().toISOString().slice(0, 10);
  const rows = await q(`UPDATE ft_assets SET status='written_off', end_date=$1 WHERE id=$2 RETURNING ${ASSET_COLS}`, [date, asset.id]);
  res.json({ asset: rows[0] });
}));

// Undo a sale or write-off: the item goes back to "in use" and any sale income is removed
app.post("/api/assets/:id/reactivate", auth, wrap(async (req, res) => {
  const uid = req.session.uid;
  const asset = await getAsset(req.params.id, uid);
  if (!asset) return res.status(404).json({ error: "Asset not found." });
  if (asset.income_tx_id) await q("DELETE FROM ft_transactions WHERE id = $1 AND user_id = $2", [asset.income_tx_id, uid]);
  const rows = await q(`UPDATE ft_assets SET status='active', sale_price=NULL, end_date=NULL, income_tx_id=NULL WHERE id=$1 RETURNING ${ASSET_COLS}`, [asset.id]);
  res.json({ asset: rows[0], removedTransactionId: asset.income_tx_id || null });
}));

app.delete("/api/assets/:id", auth, wrap(async (req, res) => {
  const uid = req.session.uid;
  const asset = await getAsset(req.params.id, uid);
  if (!asset) return res.status(404).json({ error: "Asset not found." });
  if (asset.income_tx_id) await q("DELETE FROM ft_transactions WHERE id = $1 AND user_id = $2", [asset.income_tx_id, uid]);
  await q("DELETE FROM ft_assets WHERE id = $1", [asset.id]);
  res.json({ ok: true, removedTransactionId: asset.income_tx_id || null });
}));

// ----- Backup / restore -----
app.get("/api/backup", auth, wrap(async (req, res) => {
  const uid = req.session.uid;
  const [user] = await q("SELECT settings FROM ft_users WHERE id = $1", [uid]);
  const categories = await q("SELECT type, name, color FROM ft_categories WHERE user_id = $1 ORDER BY id", [uid]);
  const transactions = await q("SELECT type, category, amount, date, description FROM ft_transactions WHERE user_id = $1 ORDER BY date, id", [uid]);
  const assets = await q("SELECT name, category, cost, purchase_date, notes, status, sale_price, end_date FROM ft_assets WHERE user_id = $1 ORDER BY id", [uid]);
  res.json({ app: "ServiceTracker", version: 2, exportedAt: new Date().toISOString(), settings: cleanSettings(user?.settings), categories, transactions, assets });
}));

app.post("/api/restore", auth, async (req, res) => {
  const { categories, transactions, settings, assets } = req.body || {};
  if (!Array.isArray(categories) || !Array.isArray(transactions)) {
    return res.status(400).json({ error: "This is not a valid backup file." });
  }
  const uid = req.session.uid;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM ft_transactions WHERE user_id = $1", [uid]);
    await client.query("DELETE FROM ft_categories WHERE user_id = $1", [uid]);
    if (Array.isArray(assets)) {
      await client.query("DELETE FROM ft_assets WHERE user_id = $1", [uid]);
      for (const raw of assets) {
        const a = cleanAsset(raw || {});
        if (a.error) continue;
        const status = ["active", "sold", "written_off"].includes(raw.status) ? raw.status : "active";
        await client.query(
          "INSERT INTO ft_assets (user_id, name, category, cost, purchase_date, notes, status, sale_price, end_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [uid, a.name, a.category, a.cost, a.purchase_date, a.notes, status, status === "sold" ? Number(raw.sale_price) || 0 : null, status === "active" ? null : (isDate(raw.end_date) ? raw.end_date : null)]
        );
      }
    }
    const seen = new Set();
    for (const c of categories) {
      const name = String(c.name || "").trim();
      if (!isType(c.type) || !name || seen.has(c.type + name)) continue;
      seen.add(c.type + name);
      await client.query("INSERT INTO ft_categories (user_id, type, name, color) VALUES ($1,$2,$3,$4)", [uid, c.type, name, c.color || null]);
    }
    let count = 0;
    for (const raw of transactions) {
      const t = cleanTx(raw || {});
      if (t.error) continue;
      if (!seen.has(t.type + t.category)) {
        seen.add(t.type + t.category);
        await client.query("INSERT INTO ft_categories (user_id, type, name, color) VALUES ($1,$2,$3,$4)", [uid, t.type, t.category, COLORS[seen.size % COLORS.length]]);
      }
      await client.query("INSERT INTO ft_transactions (user_id, type, category, amount, date, description) VALUES ($1,$2,$3,$4,$5,$6)",
        [uid, t.type, t.category, t.amount, t.date, t.description]);
      count++;
    }
    if (settings) await client.query("UPDATE ft_users SET settings = $1 WHERE id = $2", [JSON.stringify(cleanSettings(settings)), uid]);
    await client.query("COMMIT");
    res.json({ ok: true, transactions: count });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Restore error:", e);
    res.status(500).json({ error: "Restore failed." });
  } finally {
    client.release();
  }
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

export default app;
