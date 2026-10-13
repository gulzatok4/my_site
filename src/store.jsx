import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  cartCount,
  flushPendingOrders,
  getCartLines,
  loadCart,
  subscribeStore,
  syncCatalogFromServer,
} from "./lib/catalog.js";
import { cycleLang, getLang, setLang, subscribeLang, t } from "./lib/i18n.js";

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [lang, setLangState] = useState(getLang);
  const [tick, setTick] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const [contactEl, setContactEl] = useState(null);

  useEffect(() => subscribeStore(() => setTick((n) => n + 1)), []);
  useEffect(() => subscribeLang((next) => setLangState(next)), []);

  useEffect(() => {
    document.documentElement.lang = lang === "kk" ? "kk" : lang;
  }, [lang]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) setTick((n) => n + 1);
    };
    flushPendingOrders();
    syncCatalogFromServer()
      .catch(() => {})
      .finally(() => {
        if (!alive) return;
        refresh();
      });
    const onFocus = () => {
      flushPendingOrders();
      syncCatalogFromServer().finally(() => {
        if (!alive) return;
        refresh();
      });
    };
    const onStorage = (event) => {
      if (!event.key || String(event.key).startsWith("gulzat_")) refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const value = useMemo(() => {
    const cart = loadCart();
    return {
      lang,
      t: (key) => t(key, lang),
      cycleLang,
      setLang,
      cart,
      lines: getCartLines(cart),
      count: cartCount(cart),
      cartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      toggleCart: () => setCartOpen((open) => !open),
      checkout,
      openCheckout: (payload) => setCheckout(payload),
      closeCheckout: () => setCheckout(null),
      contactEl,
      openContact: (el) => {
        setCartOpen(false);
        setContactEl(el);
      },
      closeContact: () => setContactEl(null),
    };
  }, [lang, tick, cartOpen, checkout, contactEl]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Store missing");
  return value;
}
