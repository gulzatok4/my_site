import { useEffect, useRef, useState } from "react";
import { categoriesForType } from "../lib/catalog.js";
import { useStore } from "../store.jsx";

export function CategoryPicker({ itemType, value, onChange }) {
  const { t } = useStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const list = [{ code: "all", label: t("ui.allCategories") }, ...categoriesForType(itemType)];
  const current = list.find((item) => item.code === value) || list[0];

  useEffect(() => {
    function onDoc(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <div className="cat-icon-dd" ref={rootRef}>
      <button
        type="button"
        className="cat-text-btn"
        aria-label={t("ui.categories")}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={(event) => {
          event.preventDefault();
          setOpen((next) => !next);
        }}
      >
        <span>{current.label}</span>
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
          <path fill="currentColor" d="M1 1l5 5 5-5" />
        </svg>
      </button>
      <ul className="cat-icon-menu" role="listbox" hidden={!open}>
        {list.map((item) => (
          <li key={item.code} role="option" aria-selected={value === item.code}>
            <button
              type="button"
              className={`cat-icon-option${value === item.code ? " is-active" : ""}`}
              onClick={(event) => {
                event.preventDefault();
                onChange(item.code);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
