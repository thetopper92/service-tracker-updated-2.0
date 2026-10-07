import { useState } from "react";
import Inp from "./Inp";
import { api } from "../api";

export default function ForgotForm({ onAuth, go }) {
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const findAccount = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = await api.post("/api/auth/forgot/question", { email });
      setQuestion(r.question);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const { user } = await api.post("/api/auth/forgot/reset", { email, answer, newPassword: password });
      onAuth(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={question ? reset : findAccount} className="stack">
      <h2>Reset password</h2>
      <Inp label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setQuestion(""); }} required />
      {question && (
        <>
          <div className="note"><b>Security question:</b> {question}</div>
          <Inp label="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} required />
          <Inp label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
        </>
      )}
      {error && <div className="alert">{error}</div>}
      <button className="btn primary block" disabled={busy}>
        {busy ? "Please wait..." : question ? "Reset password" : "Continue"}
      </button>
      <div className="auth-links center">
        <button type="button" className="link" onClick={() => go("login")}>Back to log in</button>
      </div>
    </form>
  );
}
