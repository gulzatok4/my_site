import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney, summarizeInvoice } from "../pdf/money.js";

const REQUIRED = ["name", "bin", "address", "bank", "iik", "bik", "kbe"];

function sellerBlocked(seller) {
  if (!seller || REQUIRED.some((key) => !String(seller[key] || "").trim())) return true;
  return Boolean(seller.vatPayer) && !(Number(seller.vatRate) > 0);
}

function parsePrice(raw) {
  const value = Number(String(raw ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

function canSharePdfFile() {
  try {
    if (typeof navigator.canShare !== "function") return false;
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "Gulzat_Schet.pdf", {
      type: "application/pdf",
    });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function InvoiceDialog({ order, seller, onClose }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const [buyer, setBuyer] = useState({
    name: order.name || "",
    phone: order.phone || "",
    company: "",
    bin: "",
    address: "",
  });
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readyFile, setReadyFile] = useState(null);
  const alive = useRef(true);
  const canShare = useMemo(() => canSharePdfFile(), []);
  const blocked = sellerBlocked(seller);
  const mixed = useMemo(() => {
    const currencies = new Set(items.map((item) => String(item.currency || "kzt").toLowerCase()));
    return currencies.size > 1;
  }, [items]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const lines = useMemo(
    () =>
      items.map((item, index) => {
        const stored = Number(item.price);
        return {
          name: item.name,
          itemType: item.itemType,
          qty: item.qty,
          currency: item.currency || "kzt",
          needsPrice: !(stored > 0),
          price: stored > 0 ? stored : parsePrice(prices[index]),
        };
      }),
    [items, prices]
  );

  const summary = useMemo(
    () => summarizeInvoice(lines, { vatPayer: seller?.vatPayer, vatRate: seller?.vatRate }),
    [lines, seller]
  );

  function setBuyerField(key, value) {
    setBuyer((current) => ({ ...current, [key]: value }));
    setReadyFile(null);
    setError("");
  }

  async function run(action) {
    if (busy || blocked || !summary.ok) return;
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
      const payload = {
        order: { number: order.number, createdAt: order.createdAt },
        seller,
        buyer,
        lines,
      };
      if (action === "share") await pdf.shareInvoicePdf(payload);
      else await pdf.downloadInvoicePdf(payload);
    } catch (reason) {
      if (reason?.name === "AbortError") return;
      if (reason?.name === "NotAllowedError" && reason.file) {
        if (alive.current) {
          setReadyFile(reason.file);
          setError("PDF готов. Нажмите «Поделиться» ещё раз.");
        }
        return;
      }
      if (reason?.message === "share_unavailable") {
        if (alive.current) setError("Поделиться недоступно в этом браузере. Скачайте файл.");
        return;
      }
      console.error(reason);
      if (alive.current) setError("Не удалось собрать PDF. Попробуйте ещё раз.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const unverified = items.some((item) => item.unverified);
  const canBuild = !blocked && !mixed && summary.ok && items.length > 0 && !busy;

  return (
    <div className="admin-modal">
      <div className="admin-modal-backdrop" onClick={busy ? undefined : onClose} />
      <div className="admin-modal-dialog pdf-dialog-panel invoice-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="invoice-pdf-title">
        <div className="admin-modal-head">
          <h2 id="invoice-pdf-title">Счёт на оплату № {order.number}</h2>
          <button type="button" className="admin-modal-close" aria-label="Закрыть" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="pdf-dialog">
          {blocked ? (
            <p className="form-note" role="alert">
              Заполните реквизиты.{" "}
              <a href="#seller" onClick={onClose}>
                Открыть «Реквизиты»
              </a>
            </p>
          ) : null}
          {order.status === "cancel" ? <p className="form-note">Заказ отменён.</p> : null}
          {unverified ? <p className="form-note">Есть непроверенные позиции.</p> : null}
          {mixed ? (
            <p className="form-note" role="alert">
              Счёт возможен только в одной валюте
            </p>
          ) : null}

          <label className="field">
            <span className="field-label">Имя</span>
            <input value={buyer.name} onChange={(event) => setBuyerField("name", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Телефон</span>
            <input value={buyer.phone} onChange={(event) => setBuyerField("phone", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Компания</span>
            <input value={buyer.company} onChange={(event) => setBuyerField("company", event.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">БИН/ИИН</span>
              <input value={buyer.bin} onChange={(event) => setBuyerField("bin", event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Адрес</span>
              <input value={buyer.address} onChange={(event) => setBuyerField("address", event.target.value)} />
            </label>
          </div>

          <div className="invoice-lines">
            {lines.map((line, index) => (
              <div className="invoice-line" key={index}>
                <span>
                  {line.name || "—"} · {line.qty}
                  {summary.ok
                    ? ` · ${formatMoney(summary.items[index].priceTiyn, summary.currency)} = ${formatMoney(summary.items[index].amountTiyn, summary.currency)}`
                    : line.needsPrice
                      ? " · цена не задана"
                      : ""}
                </span>
                {line.needsPrice ? (
                  <label className="field">
                    <span className="field-label">Цена в счёте</span>
                    <input
                      inputMode="decimal"
                      value={prices[index] || ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPrices((current) => ({ ...current, [index]: value }));
                        setReadyFile(null);
                        setError("");
                      }}
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </div>

          {summary.ok ? (
            <div className="invoice-totals">
              <div>Итого: {formatMoney(summary.totalTiyn, summary.currency)}</div>
              <div>
                {summary.vatPayer && summary.vatRate > 0
                  ? `В том числе НДС ${summary.vatRate}%: ${formatMoney(summary.vatTiyn, summary.currency)}`
                  : "Без НДС"}
              </div>
            </div>
          ) : !mixed && summary.reason === "zero" ? (
            <p className="form-note">Укажите цену в счёте для позиций без цены.</p>
          ) : null}

          {error ? (
            <p className="form-note" role="alert">
              {error}
            </p>
          ) : null}
          <div className="pdf-dialog-actions">
            <button type="button" className="btn" disabled={!canBuild} onClick={() => run("download")}>
              {busy ? "Готовим PDF…" : "Скачать"}
            </button>
            {canShare ? (
              <button type="button" className="btn btn-ghost" disabled={!canBuild} onClick={() => run("share")}>
                {busy ? "Готовим PDF…" : "Поделиться"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
