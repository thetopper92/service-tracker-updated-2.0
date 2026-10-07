import { useState } from "react";
import Inp from "./Inp";
import { api } from "../api";

export default function LoginForm({ onAuth, go }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const { user } = await api.post("/api/auth/login", { email, password });
      onAuth(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <h2>Welcome back</h2>
      <Inp label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      <Inp label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      {error && <div className="alert">{error}</div>}
      <button className="btn primary block" disabled={busy}>{busy ? "Logging in..." : "Log in"}</button>
      <div className="auth-links">
        <button type="button" className="link" onClick={() => go("forgot")}>Forgot password?</button>
        <button type="button" className="link" onClick={() => go("signup")}>Create account</button>
      </div>
    </form>
  );
}
