import { useState } from "react";
import Icon from "./Icon";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";
import ForgotForm from "./ForgotForm";

export default function AuthPages({ onAuth }) {
  const [page, setPage] = useState("login");
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-logo"><Icon name="wallet" size={28} /></div>
          <h1>Service Tracker <span>2.0</span></h1>
          <p>Business income &amp; expense tracker</p>
        </div>
        {page === "login" && <LoginForm onAuth={onAuth} go={setPage} />}
        {page === "signup" && <SignupForm onAuth={onAuth} go={setPage} />}
        {page === "forgot" && <ForgotForm onAuth={onAuth} go={setPage} />}
      </div>
    </div>
  );
}
