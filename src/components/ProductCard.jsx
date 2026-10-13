import { useEffect, useState } from "react";
import {
  addToCart,
  loadCart,
  maxOrderQty,
  normalizeItemType,
  productStock,
  setCartQty,
} from "../lib/catalog.js";
import { priceLabel, stockLabel } from "../lib/display.js";
import { imageSrc } from "../lib/media.js";
import { useStore } from "../store.jsx";

function CartGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 3h2.2l.5 2H21l-2.2 8.2A2 2 0 0 1 16.9 15H8.1a2 2 0 0 1-2-1.6L4.1 4H3V3zm5.1 10h8.6l1.5-5.5H7.1L8.1 13z"
      />
    </svg>
  );
}

export function ProductCard({ product, withQty = false, withImage = true }) {
  const { t, openCheckout } = useStore();
  const max = maxOrderQty(product);
  const inCartQty = loadCart().find((item) => item.id === product.id)?.qty || 0;
  const [qty, setQty] = useState(() => Math.min(Math.max(1, max || 1), Math.max(1, inCartQty || 1)));

  useEffect(() => {
    if (max <= 0) return;
    const cap = Math.min(99, max);
    setQty((current) => Math.min(cap, Math.max(1, inCartQty > 0 ? inCartQty : current || 1)));
  }, [inCartQty, max]);

  const stock = productStock(product);
  const link = String(product.link || "").trim();
  const isService = normalizeItemType(product.itemType) === "service";
  const inCart = inCartQty > 0;
  const badgeQty = inCart ? inCartQty : qty;
  const showBadge = inCart || (withQty && qty > 1);

  function changeQty(next) {
    const value = Math.min(max || 99, Math.max(1, next));
    setQty(value);
    if (inCart) setCartQty(product.id, value);
  }

  function onCart() {
    if (max <= 0) return;
    if (inCart) {
      if (withQty) setCartQty(product.id, qty);
      return;
    }
    addToCart(product.id, withQty ? qty : 1);
  }

  function onOrder() {
    if (max <= 0) return;
    openCheckout({
      source: "product",
      product,
      qty: Math.min(max, Math.max(1, withQty ? qty : 1)),
    });
  }

  return (
    <article className={`product-card${withImage ? "" : " product-card-text"}`} data-id={product.id}>
      {withImage ? (
        <div className="product-media">
          <img src={imageSrc(product.image)} alt={product.name} loading="lazy" />
        </div>
      ) : null}
      <div className="product-body">
        <h3>{product.name}</h3>
        <p className="product-price">{priceLabel(product)}</p>
        <p className="product-desc">{product.description || ""}</p>
        {stock !== null ? (
          <p className={`product-stock${stock === 0 ? " is-out" : ""}`}>{stockLabel(product)}</p>
        ) : null}
        {link ? (
          <a className="service-link" href={link} target="_blank" rel="noopener noreferrer">
            {t("ui.viewWork")}
          </a>
        ) : null}
        {max > 0 || isService ? (
          <>
            {withQty && max > 0 ? (
              <div className="qty-row">
                <span>{t("ui.qty")}</span>
                <div className="qty-controls">
                  <button type="button" className="qty-btn" aria-label={t("ui.less")} onClick={() => changeQty(qty - 1)}>
                    −
                  </button>
                  <input
                    className="qty-input"
                    type="number"
                    min="1"
                    max={max}
                    value={qty}
                    inputMode="numeric"
                    aria-label={t("ui.qty")}
                    onChange={(event) => changeQty(Number(event.target.value) || 1)}
                  />
                  <button type="button" className="qty-btn" aria-label={t("ui.more")} onClick={() => changeQty(qty + 1)}>
                    +
                  </button>
                </div>
              </div>
            ) : null}
            <div className="card-actions">
              <button
                type="button"
                className={`btn btn-cart-label${inCart ? " is-added" : ""}`}
                aria-label={inCart ? `${t("ui.inCart")} ${badgeQty}` : t("ui.addCart")}
                title={inCart ? `${t("ui.inCart")} ${badgeQty}` : t("ui.addCart")}
                onClick={onCart}
              >
                <CartGlyph />
                <span>{t("ui.cart")}</span>
                {showBadge ? (
                  <span className="btn-cart-qty" aria-hidden="true">
                    {badgeQty > 99 ? "99+" : badgeQty}
                  </span>
                ) : null}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onOrder}>
                {t("order")}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}
