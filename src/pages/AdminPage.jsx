import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ClientsPanel } from "../admin/ClientsPanel.jsx";
import { OrdersPanel } from "../admin/OrdersPanel.jsx";
import { ProductsPanel } from "../admin/ProductsPanel.jsx";
import { SellerPanel } from "../admin/SellerPanel.jsx";
import { adminKey, setAdminKey, subscribeAdmin } from "../lib/adminSession.js";
import { disableCatalogPush, enableCatalogPush, scheduleCatalogPush, syncCatalogFromServer } from "../lib/catalog.js";

const TABS = [
  { id: "orders", label: "Заказы" },
  { id: "clients", label: "Клиенты" },
  { id: "products", label: "Товары и услуги" },
  { id: "seller", label: "Реквизиты" },
];

export function AdminPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const hash = location.hash.replace("#", "");
  const tab = TABS.some((item) => item.id === hash) ? hash : "orders";
  const [badge, setBadge] = useState(0);
  const [authed, setAuthed] = useState(Boolean(adminKey()));
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    document.body.classList.add("admin-page");
    document.body.classList.remove("products-page", "cart-open", "checkout-open");
    document.title = "Админка — Gulzat";
    const nav = document.querySelector(".admin-nav");
    const sync = () => {
      if (nav) document.documentElement.style.setProperty("--admin-nav-h", `${nav.offsetHeight}px`);
    };
    sync();
    const observer = nav ? new ResizeObserver(sync) : null;
    if (nav) observer.observe(nav);
    return () => {
      document.body.classList.remove("admin-page");
      observer?.disconnect();
    };
  }, []);

  useEffect(
    () =>
      subscribeAdmin((key) => {
        setAuthed(Boolean(key));
        if (key) scheduleCatalogPush();
      }),
    []
  );

  useEffect(() => {
    const onOutdated = () => setOutdated(true);
    window.addEventListener("gulzat:outdated-admin", onOutdated);
    return () => window.removeEventListener("gulzat:outdated-admin", onOutdated);
  }, []);

  useEffect(() => {
    enableCatalogPush((result) => {
      window.dispatchEvent(new CustomEvent("gulzat:catalog-push", { detail: result }));
    });
    syncCatalogFromServer({ mergeLocalOnce: true });
    return () => disableCatalogPush();
  }, []);

  function show(id) {
    navigate({ pathname: "/admin", hash: id }, { replace: true });
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      <header className="admin-nav">
        <Link className="logo logo-dark admin-logo" to="/">
          <img className="logo-mark" src="/logo.png" alt="" />
          Gulzat <span>админка</span>
        </Link>
        <nav className="admin-tabs" aria-label="Разделы админки">
          {TABS.map((item) => (
            <a
              key={item.id}
              className={`admin-tab-btn${tab === item.id ? " is-active" : ""}`}
              href={`#${item.id}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                show(item.id);
              }}
            >
              {item.label}
              {item.id === "orders" ? (
                <span className="orders-nav-badge" hidden={!badge}>
                  {badge}
                </span>
              ) : null}
            </a>
          ))}
        </nav>
        <Link className="btn btn-ghost admin-nav-site" to="/#shop">
          Открыть сайт
        </Link>
        <button
          type="button"
          className="btn btn-ghost"
          id="admin-logout"
          hidden={!authed}
          onClick={() => {
            setAdminKey("");
            window.dispatchEvent(new Event("gulzat:admin-logout"));
          }}
        >
          Выйти
        </button>
      </header>
      {outdated ? (
        <p className="admin-outdated" role="alert">
          Админка устарела, обновите страницу. Изменения не сохранены. Открытая форма при обновлении очистится — скопируйте текст, если он ещё нужен.
          <button type="button" onClick={() => window.location.reload()}>
            Обновить
          </button>
        </p>
      ) : null}
      <main className="admin-main admin-main--list">
        <div hidden={tab !== "orders"}>
          <OrdersPanel onBadge={setBadge} />
        </div>
        <div hidden={tab !== "clients"}>
          <ClientsPanel />
        </div>
        <div hidden={tab !== "products"}>
          <ProductsPanel />
        </div>
        <div hidden={tab !== "seller"}>
          <SellerPanel />
        </div>
      </main>
    </>
  );
}
