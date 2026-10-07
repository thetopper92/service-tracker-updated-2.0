import { useCallback, useEffect, useState } from "react";
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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(() => {
    let theme = "light";
    try { theme = localStorage.getItem("st-theme") || "light"; } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS, theme };
  });
  const [tab, setTab] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [txModal, setTxModal] = useState(null); // { tx?, type? }
  const [fabOpen, setFabOpen] = useState(false);
  const [error, setError] = useState("");

  const dark = settings.theme === "dark";
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { localStorage.setItem("st-theme", settings.theme); } catch { /* ignore */ }
  }, [dark, settings.theme]);

  const loadData = useCallback(async () => {
    try {
      const [tx, cats] = await Promise.all([api.get("/api/transactions"), api.get("/api/categories")]);
      setTransactions(tx);
      setCategories(cats);
      setError("");
    } catch (e) {
      if (e.status === 401) setUser(null);
      else setError(e.message);
    }
  }, []);

  const onAuth = useCallback((u) => {
    setUser(u);
    setSettings({ ...DEFAULT_SETTINGS, ...u.settings });
    setTab(u.settings?.defaultTab || "dashboard");
    loadData();
  }, [loadData]);

  useEffect(() => {
    api.get("/api/auth/me")
      .then(({ user: u }) => { if (u) onAuth(u); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [onAuth]);

  const saveSettings = async (next) => {
    setSettings(next);
    try { await api.put("/api/settings", next); } catch (e) { alert(e.message); }
  };

  const toggleTheme = () => {
    const next = { ...settings, theme: dark ? "light" : "dark" };
    if (user) saveSettings(next); else setSettings(next);
  };

  const saveTx = async (data, id) => {
    if (id) {
      const updated = await api.put(`/api/transactions/${id}`, data);
      setTransactions((list) => sortTx(list.map((t) => (t.id === id ? updated : t))));
    } else {
      const created = await api.post("/api/transactions", data);
      setTransactions((list) => sortTx([created, ...list]));
    }
  };

  const deleteTx = async (t) => {
    if (!confirm(`Delete this ${t.type} of ${t.amount} (${t.category})?`)) return;
    try {
      await api.del(`/api/transactions/${t.id}`);
      setTransactions((list) => list.filter((x) => x.id !== t.id));
    } catch (e) { alert(e.message); }
  };

  const logout = async () => {
    await api.post("/api/auth/logout").catch(() => {});
    setUser(null);
    setTransactions([]);
    setCategories([]);
  };

  const reload = async (withUser) => {
    if (withUser) {
      const { user: u } = await api.get("/api/auth/me");
      if (u) setSettings({ ...DEFAULT_SETTINGS, ...u.settings });
    }
    loadData();
  };

  if (loading) {
    return <div className="splash"><div className="brand-logo spin"><Icon name="wallet" size={28} /></div></div>;
  }

  if (!user) {
    return (
      <>
        <button className="theme-float icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><Icon name={dark ? "sun" : "moon"} /></button>
        {error && <div className="alert top">{error}</div>}
        <AuthPages onAuth={onAuth} />
      </>
    );
  }

  const common = { user, transactions, categories, settings, dark };
  const openAdd = (type) => { setFabOpen(false); setTxModal({ type }); };

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
          <button className="side-link" onClick={toggleTheme}><Icon name={dark ? "sun" : "moon"} /> {dark ? "Light mode" : "Dark mode"}</button>
          <button className="side-link" onClick={logout}><Icon name="logout" /> Log out</button>
        </div>
      </aside>

      <header className="topbar">
        <div className="side-brand">
          <div className="brand-logo sm"><Icon name="wallet" size={18} /></div>
          <b>Service Tracker <span>2.0</span></b>
        </div>
        <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><Icon name={dark ? "sun" : "moon"} /></button>
      </header>

      <main className="main">
        {error && <div className="alert">{error} <button className="link" onClick={() => loadData()}>Retry</button></div>}
        {tab === "dashboard" && <Dashboard {...common} onEdit={(tx) => setTxModal({ tx })} goHistory={() => setTab("transactions")} />}
        {tab === "graphs" && <Graphs {...common} />}
        {tab === "growth" && <Growth {...common} />}
        {tab === "transactions" && <Transactions {...common} onEdit={(tx) => setTxModal({ tx })} onDelete={deleteTx} />}
        {tab === "categories" && <Categories {...common} onSettings={saveSettings} reload={reload} onLogout={logout} />}
      </main>

      {/* Floating add button (left side) */}
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

const sortTx = (list) => list.slice().sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
