import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./components/Icon";
import AuthPages from "./components/AuthPages";
import Dashboard from "./components/Dashboard";
import Graphs from "./components/Graphs";
import Growth from "./components/Growth";
import Transactions from "./components/Transactions";
import Categories from "./components/Categories";
import TxForm from "./components/TxForm";
import { api } from "./api";
import { TABS, DEFAULT_SETTINGS } from "./data";
import { oilStatus } from "./oil";
import { showLocalNotification } from "./push";
import { todayISO } from "./formatters";
import { local, lastUser, tempId, queueCreate, queueUpdate, queueDelete, queueSettings, applyQueue, flushQueue } from "./offline";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(() => {
    let theme = "light";
    try { theme = localStorage.getItem("st-theme") || "light"; } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS, theme };
  });
  const [tab, setTab] = useState("dashboard");
  const [serverTx, setServerTx] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assets, setAssets] = useState([]);
  const [oilChanges, setOilChanges] = useState([]);
  const [moreFocus, setMoreFocus] = useState(null); // { id } section to open in More
  const [queue, setQueueState] = useState([]);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [syncing, setSyncing] = useState(false);
  const [txModal, setTxModal] = useState(null); // { tx?, type? }
  const [fabOpen, setFabOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const uidRef = useRef(null);
  const queueRef = useRef([]);
  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);

  const dark = settings.theme === "dark";
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { localStorage.setItem("st-theme", settings.theme); } catch { /* ignore */ }
  }, [dark, settings.theme]);

  // What the screens show = server data + changes not synced yet
  const transactions = useMemo(() => sortTx(applyQueue(serverTx, queue)), [serverTx, queue]);

  const setQueue = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(queueRef.current) : updater;
    queueRef.current = next;
    setQueueState(next);
    if (uidRef.current) local.set(uidRef.current, "queue", next);
  }, []);

  const fetchAll = useCallback(async () => {
    const uid = uidRef.current;
    const [tx, cats, as, oil] = await Promise.all([
      api.get("/api/transactions"), api.get("/api/categories"), api.get("/api/assets"), api.get("/api/oil"),
    ]);
    if (uid !== uidRef.current) return; // logged out meanwhile
    setServerTx(tx);
    setCategories(cats);
    setAssets(as);
    setOilChanges(oil);
    local.set(uid, "data", { transactions: tx, categories: cats, assets: as, oil, savedAt: Date.now() });
  }, []);

  const endSession = useCallback((keepLocal) => {
    if (!keepLocal && uidRef.current) local.clear(uidRef.current);
    uidRef.current = null;
    queueRef.current = [];
    setQueueState([]);
    setUser(null);
    setServerTx([]);
    setCategories([]);
    setAssets([]);
    setOilChanges([]);
  }, []);

  // Send offline changes to the server, then pull the latest data (also picks up changes from other phones)
  const sync = useCallback(async ({ refresh = true } = {}) => {
    if (!uidRef.current) return;
    if (syncingRef.current) { syncAgainRef.current = true; return; }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const r = await flushQueue(
        () => queueRef.current,
        (id) => setQueue((q) => q.filter((o) => o.qid !== id)),
        api
      );
      if (r.unauthorized) {
        lastUser.clear();
        endSession(true); // keep unsynced changes on this phone until the user logs in again
        setError("Your session expired. Log in again to sync your changes.");
        return;
      }
      if (r.dropped.length) setNotice(`${r.dropped.length} change${r.dropped.length > 1 ? "s" : ""} couldn't be saved: ${r.dropped[0]}`);
      if (r.offline) { setOnline(false); return; }
      if (refresh) await fetchAll();
      setOnline(true);
      setError("");
    } catch (e) {
      if (e.offline) setOnline(false);
      else if (e.status === 401) { lastUser.clear(); endSession(true); }
      else setError(e.message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      if (syncAgainRef.current) { syncAgainRef.current = false; sync(); }
    }
  }, [fetchAll, setQueue, endSession]);

  const startSession = useCallback((u, { offline = false } = {}) => {
    uidRef.current = u.id;
    const q = local.get(u.id, "queue", []);
    queueRef.current = q;
    setQueueState(q);
    const pendingSettings = q.find((o) => o.op === "settings")?.data;
    const s = { ...DEFAULT_SETTINGS, ...u.settings, ...(pendingSettings || {}) };
    setUser(u);
    setSettings(s);
    setTab(s.defaultTab || "dashboard");
    lastUser.set({ ...u, settings: s });
    const cached = local.get(u.id, "data", null);
    if (cached) {
      setServerTx(cached.transactions || []);
      setCategories(cached.categories || []);
      setAssets(cached.assets || []);
      setOilChanges(cached.oil || []);
    }
    if (!offline) sync();
  }, [sync]);

  // Start-up: use the server if reachable, otherwise open the last account from this phone
  useEffect(() => {
    api.get("/api/auth/me")
      .then(({ user: u }) => {
        if (u) startSession(u);
        else lastUser.clear();
      })
      .catch((e) => {
        const lu = lastUser.get();
        if (e.offline && lu) { setOnline(false); startSession(lu, { offline: true }); }
        else if (e.offline) setOnline(false);
        else setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [startSession]);

  // Re-sync when the connection comes back, when the app is reopened, and every 30 seconds
  useEffect(() => {
    const goOnline = () => { setOnline(true); sync(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { if (document.visibilityState === "visible") sync(); }, 30000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [sync]);

  const onAuth = useCallback((u) => { setError(""); startSession(u); }, [startSession]);

  // Links from notifications: /?section=oil opens that section in More
  useEffect(() => {
    if (!user) return;
    const openFromUrl = (url) => {
      const id = new URL(url, location.origin).searchParams.get("section");
      if (id) goMore(id);
    };
    openFromUrl(location.href);
    if (location.search) history.replaceState(null, "", "/");
    const onMsg = (e) => { if (e.data?.type === "open") openFromUrl(e.data.url); };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, [user?.id]);

  // Oil change status + a phone notification once a day when it's due and the app is opened
  const oil = useMemo(() => oilStatus(oilChanges, settings.oilInterval), [oilChanges, settings.oilInterval]);
  useEffect(() => {
    if (!user || !oil.has || !oil.due) return;
    const key = `st:${user.id}:oilLocalNotified`;
    const today = todayISO();
    try { if (localStorage.getItem(key) === today) return; } catch { /* ignore */ }
    const body = oil.left === 0 ? `It's been ${oil.since} days since your last oil change.` : `Oil change overdue by ${-oil.left} days (${oil.since} days since last change).`;
    showLocalNotification("Oil change due", body, "oil").then((shown) => {
      if (shown) { try { localStorage.setItem(key, today); } catch { /* ignore */ } }
    });
  }, [user?.id, oil.has, oil.due, oil.since]);

  const saveSettings = async (next) => {
    setSettings(next);
    if (user) lastUser.set({ ...user, settings: next });
    setQueue((q) => queueSettings(q, next));
    sync({ refresh: false });
  };

  const toggleTheme = () => {
    const next = { ...settings, theme: dark ? "light" : "dark" };
    if (user) saveSettings(next); else setSettings(next);
  };

  // Transactions are saved on the phone first, then sent to the server (works offline)
  const saveTx = async (data, id) => {
    const clean = {
      type: data.type,
      amount: Math.round(Number(data.amount) * 100) / 100,
      category: data.category,
      date: data.date,
      description: data.description || "",
      unpaid: data.type === "income" && !!data.unpaid,
    };
    if (id) setQueue((q) => queueUpdate(q, id, clean));
    else setQueue((q) => queueCreate(q, tempId(), clean));
    sync();
  };

  const markReceived = (t) => {
    saveTx({ ...t, unpaid: false }, t.id);
  };

  const goMore = (id) => { setTab("categories"); setMoreFocus({ id, at: Date.now() }); };

  const oilDoneToday = async () => {
    try { await api.post("/api/oil", { date: todayISO() }); await sync(); }
    catch (e) { alert(e.message); }
  };

  const deleteTx = (t) => {
    if (!confirm(`Delete this ${t.type} of ${t.amount} (${t.category})?`)) return;
    setQueue((q) => queueDelete(q, t.id));
    sync();
  };

  const logout = async () => {
    if (queueRef.current.length) await sync({ refresh: false });
    if (!navigator.onLine || !online) { alert("Connect to the internet to log out."); return; }
    const n = queueRef.current.length;
    if (n && !confirm(`${n} change${n > 1 ? "s" : ""} haven't synced yet and will be lost. Log out anyway?`)) return;
    try { await api.post("/api/auth/logout"); } catch (e) { if (e.offline) { alert("Connect to the internet to log out."); return; } }
    lastUser.clear();
    endSession(false);
  };

  const reload = async (withUser) => {
    if (withUser) {
      try {
        const { user: u } = await api.get("/api/auth/me");
        if (u) { setSettings({ ...DEFAULT_SETTINGS, ...u.settings }); lastUser.set(u); }
      } catch { /* offline */ }
    }
    await sync();
  };

  if (loading) {
    return <div className="splash"><div className="brand-logo spin"><Icon name="wallet" size={28} /></div></div>;
  }

  if (!user) {
    return (
      <>
        <button className="theme-float icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><Icon name={dark ? "sun" : "moon"} /></button>
        {!online && <div className="alert top">You're offline. Logging in needs an internet connection.</div>}
        {online && error && <div className="alert top">{error}</div>}
        <AuthPages onAuth={onAuth} />
      </>
    );
  }

  const common = { user, transactions, categories, assets, oilChanges, settings, dark, online };
  const openAdd = (type) => { setFabOpen(false); setTxModal({ type }); };
  const status = <SyncStatus online={online} syncing={syncing} pending={queue.length} onClick={() => sync()} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-brand">
          <div className="brand-logo sm"><Icon name="wallet" size={20} /></div>
          <b>Service Tracker <span>2.0</span></b>
        </div>
        <nav>
          {TABS.map(([key, icon, label]) => (
            <button key={key} className={`side-link ${tab === key ? "on" : ""}`} onClick={() => setTab(key)}>
              <Icon name={icon} /> {label === "More" ? "Categories & Settings" : label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-status">{status}</div>
          <button className="side-link" onClick={toggleTheme}><Icon name={dark ? "sun" : "moon"} /> {dark ? "Light mode" : "Dark mode"}</button>
          <button className="side-link" onClick={logout}><Icon name="logout" /> Log out</button>
        </div>
      </aside>

      <header className="topbar">
        <div className="side-brand">
          <div className="brand-logo sm"><Icon name="wallet" size={18} /></div>
          <b>Service Tracker <span>2.0</span></b>
        </div>
        <div className="topbar-right">
          {status}
          <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><Icon name={dark ? "sun" : "moon"} /></button>
        </div>
      </header>

      <main className="main">
        {error && <div className="alert">{error} <button className="link" onClick={() => sync()}>Retry</button></div>}
        {notice && <div className="alert">{notice} <button className="link" onClick={() => setNotice("")}>Dismiss</button></div>}
        {tab === "dashboard" && <Dashboard {...common} onEdit={(tx) => setTxModal({ tx })} onDelete={deleteTx} onReceived={markReceived}
          goHistory={() => setTab("transactions")} oil={oil} onOilDone={oilDoneToday} goOil={() => goMore("oil")} />}
        {tab === "graphs" && <Graphs {...common} />}
        {tab === "growth" && <Growth {...common} />}
        {tab === "transactions" && <Transactions {...common} onEdit={(tx) => setTxModal({ tx })} onDelete={deleteTx} onReceived={markReceived} />}
        {tab === "categories" && <Categories {...common} onSettings={saveSettings} reload={reload} onLogout={logout} focus={moreFocus}
          onEdit={(tx) => setTxModal({ tx })} onReceived={markReceived} goGraphs={() => { setTab("graphs"); window.scrollTo(0, 0); }} />}
      </main>

      {/* Floating add button (right side) */}
      {fabOpen && <div className="fab-backdrop" onClick={() => setFabOpen(false)} />}
      <div className="fab-wrap">
        {fabOpen && (
          <div className="fab-menu">
            <button className="fab-item income" onClick={() => openAdd("income")}><Icon name="up" size={18} /> Add income</button>
            <button className="fab-item expense" onClick={() => openAdd("expense")}><Icon name="down" size={18} /> Add expense</button>
          </div>
        )}
        <button className={`fab ${fabOpen ? "open" : ""}`} onClick={() => setFabOpen(!fabOpen)} aria-label="Add transaction">
          <Icon name="plus" size={28} stroke={2.5} />
        </button>
      </div>

      <nav className="tabbar">
        {TABS.map(([key, icon, label]) => (
          <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
            <Icon name={icon} size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {txModal && (
        <TxForm
          tx={txModal.tx}
          defaultType={txModal.type}
          categories={categories}
          settings={settings}
          onSave={saveTx}
          onClose={() => setTxModal(null)}
        />
      )}
    </div>
  );
}

function SyncStatus({ online, syncing, pending, onClick }) {
  let cls = "sync ok", text = "Synced";
  if (!online) { cls = "sync off"; text = pending ? `Offline · ${pending} to sync` : "Offline"; }
  else if (syncing) { cls = "sync busy"; text = "Syncing…"; }
  else if (pending) { cls = "sync wait"; text = `${pending} to sync`; }
  return (
    <button className={cls} onClick={onClick} title="Tap to sync now">
      <span className="sync-dot" />{text}
    </button>
  );
}

const sortTx = (list) => list.slice().sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
