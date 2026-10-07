import { useEffect } from "react";
import Icon from "./Icon";

export default function Modal({ title, onClose, children, accent }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-head" style={accent ? { background: accent, color: "#fff" } : undefined}>
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close" style={accent ? { color: "#fff" } : undefined}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
