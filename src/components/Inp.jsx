import { useState } from "react";
import Icon from "./Icon";

export default function Inp({ label, type = "text", options, hint, ...props }) {
  const [show, setShow] = useState(false);
  let control;
  if (options) {
    control = (
      <select className="input" {...props}>
        {options.map((o) => {
          const value = typeof o === "string" ? o : o.value;
          const text = typeof o === "string" ? o : o.label;
          return <option key={value} value={value}>{text}</option>;
        })}
      </select>
    );
  } else if (type === "textarea") {
    control = <textarea className="input" rows={3} {...props} />;
  } else if (type === "password") {
    control = (
      <div className="pw-wrap">
        <input className="input" type={show ? "text" : "password"} {...props} />
        <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
          <Icon name={show ? "eyeOff" : "eye"} size={18} />
        </button>
      </div>
    );
  } else {
    control = <input className="input" type={type} {...props} />;
  }
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {control}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
