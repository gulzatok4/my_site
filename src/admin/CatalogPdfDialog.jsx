import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeStore } from "../lib/catalog.js";
import { ornamentBorderDataUri } from "../pdf/ornament.js";
import { catalogMatchCount, choiceKey, choicesForScope } from "../pdf/select.js";

const catalogFrameStyle = {
  borderWidth: 20,
  borderStyle: "solid",
  borderColor: "transparent",
  borderImageSource: ornamentBorderDataUri({ paper: "#faf8f2" }),
  borderImageSlice: 22,
  borderImageWidth: "20px",
  borderImageRepeat: "round",
  borderRadius: 0,
};

function canSharePdfFile() {
  try {
    if (typeof navigator.canShare !== "function") return false;
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "Gulzat_Katalog.pdf", {
      type: "application/pdf",
    });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function countLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "позиций";
  if (mod10 === 1) return "позиция";
  if (mod10 >= 2 && mod10 <= 4) return "позиции";
  return "позиций";
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
  const [readyFile, setReadyFile] = useState(null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  const canShare = useMemo(() => canSharePdfFile(), []);

  useEffect(() => subscribeStore(() => setTick((value) => value + 1)), []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setReadyFile(null);
  }, [scope, selected, showPrices]);

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
    if (action === "share" && readyFile) {
      try {
        await navigator.share({ files: [readyFile], title: readyFile.name });
        if (alive.current) {
          setReadyFile(null);
          setError("");
        }
      } catch (reason) {
        if (reason?.name === "AbortError") return;
        console.error(reason);
        if (alive.current) setError("Не удалось отправить PDF. Попробуйте ещё раз.");
      }
      return;
    }
    setBusy(true);
    setError("");
    setReadyFile(null);
    try {
      const pdf = await import("../pdf/output.js");
      const options = { scope, selectedKeys: selected, showPrices };
      const failed = action === "share" ? await pdf.shareCatalogPdf(options) : await pdf.downloadCatalogPdf(options);
      if (alive.current && failed > 0) {
        setError(`PDF сохранён. Не загрузилось фото: ${failed}. На их месте — цветная плашка.`);
      }
    } catch (reason) {
      if (reason?.name === "AbortError") return;
      if (reason?.name === "NotAllowedError" && reason.file) {
        if (alive.current) {
          setReadyFile(reason.file);
          setError("PDF готов. Нажмите «Поделиться» ещё раз.");
        }
        return;
      }
      console.error(reason);
      if (alive.current) setError("Не удалось собрать PDF. Попробуйте ещё раз.");
    } finally {
      if (alive.current) setBusy(false);
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
      <div className="admin-modal-dialog pdf-dialog-panel catalog-pdf-panel" style={catalogFrameStyle} role="dialog" aria-modal="true" aria-labelledby="catalog-pdf-title">
        <div className="admin-modal-head">
          <div>
            <h2 id="catalog-pdf-title">Каталог PDF</h2>
          </div>
          <button type="button" className="admin-modal-close" aria-label="Закрыть" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="pdf-dialog">
          <p className="pdf-dialog-lead">Современный каталог в цветах сайта, с национальным орнаментом. В файл войдёт {count === 0 ? "ни одной позиции" : `${count} ${countLabel(count)}`}.</p>
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
