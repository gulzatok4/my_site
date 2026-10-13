import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import {
  clearCart,
  loadCart,
  maxOrderQty,
  removeFromCart,
  setCartQty,
} from "../lib/catalog.js";
import { cartLinePrice, cartTotalView } from "../lib/display.js";
import { imageSrc } from "../lib/media.js";
import { useStore } from "../store.jsx";

function NavCartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 3h2.2l.5 2H21l-2.2 8.2A2 2 0 0 1 16.9 15H8.1a2 2 0 0 1-2-1.6L4.1 4H3V3zm5.1 10h8.6l1.5-5.5H7.1L8.1 13z"
      />
    </svg>
  );
}

export function CartDrawer() {
  const { t, lines, count, cartOpen, closeCart, toggleCart, openCheckout } = useStore();
  const location = useLocation();
  const totals = cartTotalView(lines);
  const onProducts = location.pathname === "/products";

  return (
    <>
      <button
        type="button"
        className="cart-toggle"
        aria-label={t("nav.cart")}
        aria-expanded={cartOpen}
        aria-controls="cart-panel"
        onClick={toggleCart}
      >
        <NavCartIcon />
        <span className="cart-label">{t("nav.cart")}</span>
        <span className="cart-badge" hidden={count <= 0}>
          {count}
        </span>
      </button>

      {/* Rendered into body: the nav's backdrop-filter would otherwise become the containing block for position: fixed. */}
      {createPortal(
        <>
          <div className="cart-backdrop" hidden={!cartOpen} onClick={closeCart} />
          <aside className={`cart-panel${cartOpen ? " is-open" : ""}`} id="cart-panel" aria-hidden={!cartOpen} aria-labelledby="cart-title">
            <div className="cart-panel-head">
              <h2 id="cart-title">{t("cart.title")}</h2>
              <button type="button" className="cart-close" aria-label={t("cart.close")} onClick={closeCart}>
                ×
              </button>
            </div>
            <div className="cart-list">
              {lines.length ? (
                lines.map((line) => (
                  <article className="cart-item" key={line.product.id}>
                    <img src={imageSrc(line.product.image)} alt="" />
                    <div className="cart-item-body">
                      <h3>{line.product.name}</h3>
                      <p className="cart-item-price">{cartLinePrice(line)}</p>
                      <div className="qty-controls cart-qty">
                        <button
                          type="button"
                          className="qty-btn"
                          aria-label={t("ui.less")}
                          onClick={() => setCartQty(line.product.id, line.qty - 1)}
                        >
                          −
                        </button>
                        <input
                          className="qty-input"
                          type="number"
                          min="1"
                          max={maxOrderQty(line.product)}
                          value={line.qty}
                          inputMode="numeric"
                          aria-label={t("ui.qty")}
                          onChange={(event) => setCartQty(line.product.id, Math.max(1, Number(event.target.value) || 1))}
                        />
                        <button
                          type="button"
                          className="qty-btn"
                          aria-label={t("ui.more")}
                          onClick={() => setCartQty(line.product.id, line.qty + 1)}
                        >
                          +
                        </button>
                      </div>
                      <button type="button" className="cart-remove" onClick={() => removeFromCart(line.product.id)}>
                        {t("cart.remove")}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="cart-empty">{t("cart.empty")}</p>
              )}
            </div>
            <div className="cart-footer" hidden={!lines.length}>
              <p className="cart-total">
                {totals.total}
                {totals.note ? <span className="cart-total-note">{totals.note}</span> : null}
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!lines.length) return;
                  openCheckout({ source: "cart" });
                }}
              >
                {t("cart.checkout")}
              </button>
              <Link
                className="btn"
                to="/products"
                onClick={(event) => {
                  closeCart();
                  if (onProducts) {
                    event.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              >
                {t("cart.addMore")}
              </Link>
              <button
                type="button"
                className="btn btn-ghost cart-clear"
                onClick={() => {
                  clearCart();
                  loadCart();
                }}
              >
                {t("cart.clear")}
              </button>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}
