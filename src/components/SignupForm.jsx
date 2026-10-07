import { useState } from "react";
import Inp from "./Inp";
import { api } from "../api";
import { HINT_QS } from "../data";

export default function SignupForm({ onAuth, go }) {
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", hintQ: HINT_QS[0], hintA: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (f.password !== f.confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const { user } = await api.post("/api/auth/signup", f);
      onAuth(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <h2>Create your account</h2>
      <Inp label="Full name" value={f.name} onChange={set("name")} required autoComplete="name" />
      <Inp label="Email" type="email" value={f.email} onChange={set("email")} required autoComplete="email" />
      <div className="grid2">
        <Inp label="Password" type="password" value={f.password} onChange={set("password")} required minLength={6} autoComplete="new-password" />
        <Inp label="Confirm password" type="password" value={f.confirm} onChange={set("confirm")} required minLength={6} autoComplete="new-password" />
      </div>
      <Inp label="Security question" value={f.hintQ} onChange={set("hintQ")} options={HINT_QS} hint="Used to reset your password if you forget it." />
      <Inp label="Your answer" value={f.hintA} onChange={set("hintA")} required />
      {error && <div className="alert">{error}</div>}
      <button className="btn primary block" disabled={busy}>{busy ? "Creating..." : "Create account"}</button>
      <div className="auth-links center">
        <span className="muted">Already have an account?</span>
        <button type="button" className="link" onClick={() => go("login")}>Log in</button>
      </div>
    </form>
  );
}
