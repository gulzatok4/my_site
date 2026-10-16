import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  cartWhatsAppUrl,
  clearCart,
  formatPhone,
  getCartLines,
  loadCart,
  loadCartWishes,
  loadCustomer,
  loadProducts,
  maxOrderQty,
  normalizeItemType,
  normalizePhone,
  orderItemFromProduct,
  orderItemsFromCart,
  orderRequestBody,
  orderWhatsAppUrl,
  queuePendingOrder,
  saveCustomer,
  sendOrderToCrm,
} from "../lib/catalog.js";
import { todayIso } from "../lib/display.js";
import { useStore } from "../store.jsx";

export function CheckoutModal() {
  const { t, checkout, closeCheckout, closeCart } = useStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [color, setColor] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);
  const lock = useRef(false);
  const clientIdRef = useRef("");

  const hasProducts = checkout
    ? checkout.source === "cart"
      ? getCartLines().some((line) => normalizeItemType(line.product.itemType) !== "service")
      : normalizeItemType(checkout.product?.itemType) !== "service"
    : false;

  const summary = checkout
    ? checkout.source === "cart"
      ? getCartLines().map((line) => ({ name: line.product.name, qty: line.qty }))
      : [{ name: checkout.product.name, qty: checkout.qty }]
    : [];

  useEffect(() => {
    if (!checkout) return;
    const saved = loadCustomer();
    setName(saved.name);
    setPhone(saved.phone ? formatPhone(saved.phone) : "");
    const wishes = checkout.source === "cart" ? loadCartWishes() : { color: "", dueDate: "", comment: "" };
    setColor(wishes.color.slice(0, 300));
    setDueDate(wishes.dueDate >= todayIso() ? wishes.dueDate : "");
    setComment(wishes.comment.slice(0, 500));
    setError("");
    setOffline(false);
    setSending(false);
    lock.current = false;
    clientIdRef.current = "";
  }, [checkout]);

  if (!checkout) return null;

  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    if (!cleanName) {
      setError(t("checkout.errName"));
      return;
    }
    if (!cleanPhone) {
      setError(t("checkout.errPhone"));
      return;
    }
    if (dueDate && dueDate < todayIso()) {
      setError(t("checkout.errDate"));
      return;
    }
    const fromCart = checkout.source === "cart";
    const product = fromCart ? null : loadProducts().find((item) => item.id === checkout.product?.id) || checkout.product;
    const qty = fromCart ? 1 : Math.min(maxOrderQty(product), Math.max(1, Number(checkout.qty) || 1));
    if (!fromCart && maxOrderQty(product) <= 0) {
      setError(t("ui.outOfStock"));
      return;
    }
    const items = fromCart ? orderItemsFromCart() : [orderItemFromProduct(product, qty)].filter(Boolean);
    if (!items.length) {
      setError(t("checkout.errSend"));
      return;
    }
    lock.current = true;
    setSending(true);
    setOffline(false);
    const wishes = {
      color: hasProducts ? color.trim() : "",
      dueDate,
      comment: comment.trim(),
    };
    const customer = { name: cleanName, phone: cleanPhone };
    if (!clientIdRef.current) {
      clientIdRef.current = `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
    const status = await sendOrderToCrm({
      customer,
      channel: "whatsapp",
      source: checkout.source,
      items,
      wishes,
      clientId: clientIdRef.current,
    });
    if (status === "retry") {
      lock.current = false;
      setSending(false);
      setOffline(true);
      setError(t("checkout.offline"));
      return;
    }
    if (
      status === "rejected" ||
      status === "out_of_stock" ||
      status === "price_changed" ||
      status === "unavailable" ||
      status === "rate_limited" ||
      status === "too_many"
    ) {
      lock.current = false;
      setSending(false);
      const message =
        status === "out_of_stock"
          ? t("ui.outOfStock")
          : status === "price_changed"
            ? t("checkout.errPrice")
            : status === "unavailable"
              ? t("checkout.errGone")
              : status === "rate_limited"
                ? t("checkout.errRate")
                : status === "too_many"
                  ? t("checkout.errMany")
                  : t("checkout.errSend");
      setError(message);
      return;
    }
    saveCustomer(customer);
    const url = fromCart
      ? cartWhatsAppUrl(loadCart(), customer, wishes)
      : orderWhatsAppUrl(product, items[0].qty, customer, wishes);
    if (fromCart) {
      clearCart();
      closeCart();
    }
    closeCheckout();
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.assign(url);
  }

  function sendViaWhatsApp() {
    const fromCart = checkout.source === "cart";
    const product = fromCart ? null : loadProducts().find((item) => item.id === checkout.product?.id) || checkout.product;
    const qty = fromCart ? 1 : Math.min(maxOrderQty(product), Math.max(1, Number(checkout.qty) || 1));
    const items = fromCart ? orderItemsFromCart() : [orderItemFromProduct(product, qty)].filter(Boolean);
    if (!items.length) return;
    const wishes = {
      color: hasProducts ? color.trim() : "",
      dueDate,
      comment: comment.trim(),
    };
    const customer = { name: name.trim(), phone: normalizePhone(phone) };
    const body = orderRequestBody({
      customer,
      channel: "whatsapp",
      source: checkout.source,
      items,
      wishes,
      clientId: clientIdRef.current,
    });
    queuePendingOrder(JSON.stringify(body));
    const url = fromCart
      ? cartWhatsAppUrl(loadCart(), customer, wishes)
      : orderWhatsAppUrl(product, items[0].qty, customer, wishes);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.assign(url);
    if (fromCart) {
      clearCart();
      closeCart();
    }
    closeCheckout();
  }

  return (
    <div className="checkout-modal" id="checkout-modal">
      <div className="checkout-backdrop" onClick={closeCheckout} />
      <div className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <button type="button" className="checkout-close" aria-label={t("checkout.close")} onClick={closeCheckout}>
          ×
        </button>
        <h2 id="checkout-title">{t("checkout.title")}</h2>
        <p className="checkout-lead">{t("checkout.lead")}</p>
        <ul className="checkout-summary">
          {summary.map((item) => (
            <li key={`${item.name}-${item.qty}`}>
              <span>{item.name}</span>
              <span>× {item.qty}</span>
            </li>
          ))}
        </ul>
        <form className="checkout-form" noValidate onSubmit={submit}>
          <label>
            <span>{t("checkout.name")}</span>
            <input
              type="text"
              maxLength={80}
              autoComplete="name"
              required
              placeholder={t("checkout.namePh")}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
            />
          </label>
          <label>
            <span>{t("checkout.phone")}</span>
            <input
              type="tel"
              maxLength={20}
              autoComplete="tel"
              inputMode="tel"
              placeholder="+7 777 123 45 67"
              required
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setError("");
              }}
            />
          </label>
          {hasProducts ? (
            <label>
              <span>
                <span>{t("checkout.color")}</span> <small className="checkout-optional">({t("checkout.optional")})</small>
              </span>
              <input
                type="text"
                maxLength={300}
                autoComplete="off"
                placeholder={t("checkout.colorPh")}
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
          ) : null}
          <label>
            <span>
              <span>{t("checkout.dueDate")}</span> <small className="checkout-optional">({t("checkout.optional")})</small>
            </span>
            <input type="date" min={todayIso()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label>
            <span>
              <span>{t("checkout.comment")}</span> <small className="checkout-optional">({t("checkout.optional")})</small>
            </span>
            <textarea
              rows={2}
              maxLength={500}
              placeholder={t("checkout.commentPh")}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <p className="checkout-terms">
            <span>{t("checkout.terms")}</span>{" "}
            <Link to="/#delivery" onClick={closeCheckout}>
              {t("checkout.termsLink")}
            </Link>
          </p>
          <p className="checkout-error" role="alert">
            {error}
          </p>
          {offline ? (
            <div className="checkout-offline">
              <button type="button" className="btn checkout-submit" disabled={sending} onClick={submit}>
                {t("checkout.retry")}
              </button>
              <button type="button" className="btn btn-ghost" disabled={sending} onClick={sendViaWhatsApp}>
                {t("checkout.waInstead")}
              </button>
            </div>
          ) : (
            <button type="submit" className="btn checkout-submit" disabled={sending}>
              {t("checkout.submitWa")}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
