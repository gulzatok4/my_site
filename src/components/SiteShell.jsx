import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { langTitle } from "../lib/display.js";
import { useStore } from "../store.jsx";
import { CartDrawer } from "./CartDrawer.jsx";
import { ChatWidget } from "./ChatWidget.jsx";
import { CheckoutModal } from "./CheckoutModal.jsx";
import { ContactPopover } from "./ContactPopover.jsx";

export function SiteShell() {
  const { t, cycleLang, cartOpen, checkout, contactEl, closeCart, closeCheckout, closeContact, openContact } = useStore();
  const location = useLocation();
  const navRef = useRef(null);
  const home = location.pathname === "/";
  const lang = langTitle();

  useEffect(() => {
    closeContact();
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle("products-page", location.pathname === "/products" || location.pathname === "/services");
    document.body.classList.remove("admin-page");
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle("cart-open", cartOpen);
  }, [cartOpen]);

  useEffect(() => {
    document.body.classList.toggle("checkout-open", Boolean(checkout || contactEl));
  }, [checkout, contactEl]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const update = () => {
      document.documentElement.style.setProperty("--nav-h", `${nav.offsetHeight}px`);
      nav.classList.toggle("is-scrolled", window.scrollY > 10);
      if (!home) {
        nav.querySelectorAll('a.pill[href*="#"]').forEach((link) => {
          link.classList.remove("is-active");
          link.removeAttribute("aria-current");
        });
        return;
      }
      const links = Array.from(nav.querySelectorAll('a.pill[href*="#"]'))
        .map((link) => {
          const hash = link.getAttribute("href").split("#")[1];
          return { link, section: hash ? document.getElementById(hash) : null };
        })
        .filter((item) => item.section);
      if (!links.length) return;
      const navHeight = nav.offsetHeight;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current = links[0];
      if (atBottom) current = links[links.length - 1];
      else {
        for (const item of links) {
          if (item.section.getBoundingClientRect().top <= navHeight + 80) current = item;
        }
      }
      links.forEach((item) => {
        const active = item === current;
        item.link.classList.toggle("is-active", active);
        if (active) item.link.setAttribute("aria-current", "location");
        else item.link.removeAttribute("aria-current");
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [home, location.pathname, lang.text]);

  useEffect(() => {
    if (!location.hash || !/^#[A-Za-z][\w-]*$/.test(location.hash)) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView();
  }, [location.pathname, location.hash]);

  useEffect(() => {
    function onKey(event) {
      if (event.key !== "Escape") return;
      if (contactEl) {
        closeContact();
        return;
      }
      if (checkout) {
        closeCheckout();
        return;
      }
      closeCart();
    }
    function onWheel(event) {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "number" && document.activeElement === target) {
        event.preventDefault();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("wheel", onWheel);
    };
  }, [contactEl, checkout, closeContact, closeCheckout, closeCart]);

  return (
    <>
      <header className="nav" ref={navRef}>
        <Link className="logo" to="/#top">
          <img className="logo-mark" src="/logo.png" alt="" />
          Gulzat
        </Link>
        <div className="nav-actions">
          <Link className="pill nav-hide-mobile" to="/#top">
            {t("nav.home")}
          </Link>
          <Link className={`pill${home ? "" : " nav-hide-mobile"}`} to="/#shop">
            {t("nav.shop")}
          </Link>
          {home ? null : (
            <>
              <Link
                className={`pill${location.pathname === "/services" ? " is-active" : ""}`}
                to="/services"
                aria-current={location.pathname === "/services" ? "page" : undefined}
              >
                {t("nav.services")}
              </Link>
              <Link
                className={`pill${location.pathname === "/products" ? " is-active" : ""}`}
                to="/products"
                aria-current={location.pathname === "/products" ? "page" : undefined}
              >
                {t("nav.products")}
              </Link>
            </>
          )}
          <CartDrawer />
          <a
            className="pill"
            href="/#contact"
            onClick={(event) => {
              event.preventDefault();
              openContact(event.currentTarget);
            }}
          >
            {t("nav.contact")}
          </a>
          <button type="button" className="lang-switch" aria-label={lang.title} title={lang.title} onClick={cycleLang}>
            {lang.text}
          </button>
        </div>
      </header>
      <Outlet />
      <CheckoutModal />
      <ContactPopover />
      <ChatWidget />
    </>
  );
}
