import { useEffect } from "react";
import { Link } from "react-router-dom";
import { loadProducts, maxOrderQty } from "../lib/catalog.js";
import { priceLabel, stockLabel } from "../lib/display.js";
import { useStore } from "../store.jsx";

export function HomePage() {
  const { t, lang, openCheckout, openContact } = useStore();
  const service = loadProducts().find((item) => item.id === "service-sample-it");
  const goods = loadProducts().find((item) => item.id === "ready-made-sets");
  const serviceReady = Boolean(service) && maxOrderQty(service) > 0;
  const goodsReady = Boolean(goods) && maxOrderQty(goods) > 0;

  useEffect(() => {
    document.title = t("page.title");
  }, [t, lang]);

  function orderSeed(id) {
    const product = loadProducts().find((item) => item.id === id);
    if (!product || maxOrderQty(product) <= 0) return;
    openCheckout({ source: "product", product, qty: 1 });
  }

  return (
    <>
      <main id="top">
        <section className="hero">
          <img className="hero-bg" src="/images/hero-gulzat-workspace.png?v=1" alt="Работа за ноутбуком среди материалов для рукоделия" />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-copy">
            <h1>
              <span className="hero-line">{t("hero.l1")}</span>
              <span className="hero-line">{t("hero.l2")}</span>
              <span className="hero-line">
                <em>{t("hero.l3")}</em>
              </span>
            </h1>
            <p>{t("hero.p")}</p>
          </div>
        </section>

        <section className="about" id="about">
          <div className="about-copy">
            <h2 dangerouslySetInnerHTML={{ __html: t("about.title.html") }} />
            <p>{t("about.p1")}</p>
            <p>{t("about.p2")}</p>
            <a className="btn btn-ghost" href="#contact" onClick={(event) => { event.preventDefault(); openContact(event.currentTarget); }}>
              {t("about.write")}
            </a>
          </div>
          <div className="about-visual">
            <img src="/images/about-it-craft.png" alt="Рабочее место: ноутбук с CRM, планшет, телефон и материалы для рукоделия" />
          </div>
        </section>

        <section className="work" id="work">
          <h2>{t("work.title")}</h2>
          <div className="work-grid">
            <article>
              <div className="ico" aria-hidden="true">▣</div>
              <h3>{t("work.it.title")}</h3>
              <p>{t("work.it.p")}</p>
            </article>
            <article>
              <div className="ico" aria-hidden="true">▸</div>
              <h3>{t("work.ai.title")}</h3>
              <p>{t("work.ai.p")}</p>
            </article>
            <article>
              <div className="ico" aria-hidden="true">✦</div>
              <h3>{t("work.craft.title")}</h3>
              <p>{t("work.craft.p")}</p>
            </article>
            <article>
              <div className="ico" aria-hidden="true">❀</div>
              <h3>{t("work.photo.title")}</h3>
              <p>{t("work.photo.p")}</p>
            </article>
          </div>
        </section>

        <section className="shop" id="shop">
          <div className="shop-head">
            <h2>{t("shop.title")}</h2>
            <p>{t("shop.lead")}</p>
          </div>
          <div className="shop-panels">
            <div className="shop-panel" id="services-panel">
              <h3 className="shop-subtitle">{t("shop.services")}</h3>
              <article className="product-card shop-feature services-feature" data-id="service-sample-it" data-locked="true">
                <div className="product-media shop-feature-media">
                  <img src="/images/service-it.png?v=2" alt="Услуги: рабочее место с ноутбуком" />
                </div>
                <div className="product-body">
                  <h3>{service?.name || t("feat.service.title")}</h3>
                  <p className="product-price">{service ? priceLabel(service) : t("feat.service.price")}</p>
                  <p className="product-desc">{service?.description || t("feat.service.desc")}</p>
                  {service && stockLabel(service) ? <p className="product-stock">{stockLabel(service)}</p> : null}
                  <div className="card-actions">
                    <Link className="btn" to="/services">{t("feat.service.all")}</Link>
                    <button type="button" className="btn btn-ghost" disabled={!serviceReady} onClick={() => orderSeed("service-sample-it")}>{t("order")}</button>
                  </div>
                </div>
              </article>
            </div>
            <div className="shop-panel" id="products-panel">
              <h3 className="shop-subtitle">{t("shop.products")}</h3>
              <article className="product-card shop-feature products-feature" data-id="ready-made-sets" data-locked="true">
                <div className="product-media shop-feature-media">
                  <img src="/images/products-ready-LOCKED.png?v=1" alt="Товары: готовые изделия ручной работы" />
                </div>
                <div className="product-body">
                  <h3>{goods?.name || t("feat.product.title")}</h3>
                  <p className="product-price">{goods ? priceLabel(goods) : t("feat.product.price")}</p>
                  <p className="product-desc">{goods?.description || t("feat.product.desc")}</p>
                  {goods && stockLabel(goods) ? <p className={`product-stock${maxOrderQty(goods) <= 0 ? " is-out" : ""}`}>{stockLabel(goods)}</p> : null}
                  <div className="card-actions">
                    <Link className="btn" to="/products">{t("feat.product.all")}</Link>
                    <button type="button" className="btn btn-ghost" disabled={!goodsReady} onClick={() => orderSeed("ready-made-sets")}>{t("order")}</button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="work delivery" id="delivery">
          <h2>{t("delivery.title")}</h2>
          <div className="work-grid">
            <article>
              <div className="ico" aria-hidden="true">✂</div>
              <h3>{t("delivery.make.title")}</h3>
              <p>{t("delivery.make.p")}</p>
            </article>
            <article>
              <div className="ico" aria-hidden="true">⌂</div>
              <h3>{t("delivery.pickup.title")}</h3>
              <p>{t("delivery.pickup.p")}</p>
            </article>
            <article>
              <div className="ico" aria-hidden="true">➜</div>
              <h3>{t("delivery.kz.title")}</h3>
              <p>{t("delivery.kz.p")}</p>
            </article>
            <article>
              <div className="ico" aria-hidden="true">₸</div>
              <h3>{t("delivery.pay.title")}</h3>
              <p>{t("delivery.pay.p")}</p>
            </article>
          </div>
        </section>

        <section className="quote-band">
          <div className="quote-avatar" aria-hidden="true">G</div>
          <blockquote>
            <span>{t("quote")}</span>
            <cite>— Gulzat</cite>
          </blockquote>
        </section>

        <section className="contact" id="contact">
          <h2>{t("contact.title")}</h2>
          <p className="phone">
            <a href="tel:+77051406940">8 705 140 69 40</a>
          </p>
          <div className="contact-links">
            <a className="btn" href="https://wa.me/77051406940" target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </div>
        </section>
      </main>
      <footer>
        <span>Gulzat · 2026</span>
        <span>{t("footer.years")}</span>
      </footer>
    </>
  );
}
