import { useEffect, useMemo, useState } from "react";
import { subscribeStore } from "../lib/catalog.js";
import { catalogMatchCount, choiceKey, choicesForScope } from "../pdf/select.js";

function canSharePdfFile() {
  try {
    if (typeof navigator.canShare !== "function") return false;
    const file = new File([new Blob()], "Gulzat_Katalog.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function defaultKeys(scope) {
  return choicesForScope(scope)
    .filter((choice) => !choice.hidden)
    .map((choice) => choiceKey(choice));
}

export function CatalogPdfDialog({ onClose }) {
  const [scope, setScope] = useState("products");
  const [selected, setSelected] = useState(() => defaultKeys("products"));
  const [showPrices, setShowPrices] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const canShare = useMemo(() => canSharePdfFile(), []);

  useEffect(() => subscribeStore(() => setTick((value) => value + 1)), []);

  const choices = useMemo(() => choicesForScope(scope), [scope, tick]);
  const count = catalogMatchCount({ scope, selectedKeys: selected });
  const empty = count === 0;

  function changeScope(next) {
    setScope(next);
    setSelected(defaultKeys(next));
    setError("");
  }

  function toggle(key) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
    setError("");
  }

  async function run(action) {
    if (busy || empty) return;
    setBusy(true);
    setError("");
    try {
      const pdf = await import("../pdf/output.js");
      const options = { scope, selectedKeys: selected, showPrices };
      if (action === "share") await pdf.shareCatalogPdf(options);
      else await pdf.downloadCatalogPdf(options);
    } catch (reason) {
      if (reason?.name === "AbortError") return;
      console.error(reason);
      setError("Не удалось собрать PDF. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  const groups =
    scope === "all"
      ? [
          ["Товары", choices.filter((choice) => choice.itemType === "product")],
          ["Услуги", choices.filter((choice) => choice.itemType === "service")],
        ]
      : [["", choices]];

  return (
    <div className="admin-modal">
      <div className="admin-modal-backdrop" onClick={busy ? undefined : onClose} />
      <div className="admin-modal-dialog pdf-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-pdf-title">
        <div className="admin-modal-head">
          <h2 id="catalog-pdf-title">Каталог PDF</h2>
          <button type="button" className="admin-modal-close" aria-label="Закрыть" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="pdf-dialog">
          <div className="pdf-dialog-choices" role="radiogroup" aria-label="Что включить">
            {[
              ["products", "Товары"],
              ["services", "Услуги"],
              ["all", "Всё"],
            ].map(([value, label]) => (
              <label className="pdf-check" key={value}>
                <input type="radio" name="pdf-scope" checked={scope === value} onChange={() => changeScope(value)} />
                {label}
              </label>
            ))}
          </div>
          <div className="pdf-dialog-cats">
            {groups.map(([title, items]) => (
              <div key={title || "one"}>
                {title ? <p className="pdf-dialog-group">{title}</p> : null}
                {items.map((choice) => {
                  const key = choiceKey(choice);
                  return (
                    <label className="pdf-check" key={key}>
                      <input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} />
                      <span>
                        {choice.label}
                        {choice.hidden ? " (скрыта)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          <label className="pdf-check">
            <input type="checkbox" checked={showPrices} onChange={(event) => setShowPrices(event.target.checked)} />
            Показывать цены
          </label>
          {empty ? <p className="form-note">Нет позиций для каталога</p> : null}
          {error ? (
            <p className="form-note" role="alert">
              {error}
            </p>
          ) : null}
          <div className="pdf-dialog-actions">
            <button type="button" className="btn" disabled={busy || empty} onClick={() => run("download")}>
              {busy ? "Готовим PDF…" : "Скачать"}
            </button>
            {canShare ? (
              <button type="button" className="btn btn-ghost" disabled={busy || empty} onClick={() => run("share")}>
                {busy ? "Готовим PDF…" : "Поделиться"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
