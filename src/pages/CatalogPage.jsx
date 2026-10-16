import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { categoriesForType, isListedProduct, loadProducts, normalizeItemType } from "../lib/catalog.js";
import { catalogLead, sortBySeeds } from "../lib/display.js";
import { useStore } from "../store.jsx";
import { CategoryPicker } from "../components/CategoryPicker.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { ProductCard } from "../components/ProductCard.jsx";

const SEEDS = {
  products: ["ready-made-sets", "product-baskets", "product-poufs", "product-photozone"],
  services: ["service-sample-it", "service-sites", "service-ai-video"],
};

export function CatalogPage({ kind }) {
  const { t, lang } = useStore();
  const [category, setCategory] = useState("all");
  const itemType = kind === "services" ? "service" : "product";
  const categoryKey = categoriesForType(itemType).map((item) => item.code).join("|");
  const activeCategory = category === "all" || categoryKey.split("|").includes(category) ? category : "all";
  const products = sortBySeeds(
    loadProducts().filter((item) => normalizeItemType(item.itemType) === itemType && isListedProduct(item)),
    SEEDS[kind]
  ).filter((item) => activeCategory === "all" || item.category === activeCategory);

  useEffect(() => {
    document.title = t(kind === "services" ? "page.servicesTitle" : "page.productsTitle");
  }, [kind, lang, t]);

  useEffect(() => {
    setCategory("all");
  }, [kind]);

  useEffect(() => {
    if (category !== "all" && !categoryKey.split("|").filter(Boolean).includes(category)) setCategory("all");
  }, [category, categoryKey]);

  const lead = products.length ? catalogLead(kind, products.length) : t(`catalog.${kind}.lead`);

  return (
    <>
      <main id="top">
        <section className="shop catalog" id="shop">
          <div className="catalog-head">
            <Link className="catalog-back" to="/">
              {t("catalog.back")}
            </Link>
            <div className="catalog-titles">
              <p className="catalog-kicker">{t(`catalog.${kind}.kicker`)}</p>
              <div className="catalog-title-row">
                <h1>{t(`catalog.${kind}.title`)}</h1>
                <div className="cat-pick catalog-cat">
                  <CategoryPicker itemType={itemType} value={activeCategory} onChange={setCategory} />
                </div>
              </div>
              <p>{products.length ? lead : t(`catalog.${kind}.lead`)}</p>
            </div>
          </div>
          <div className="shop-grid catalog-grid">
            {products.length ? (
              products.map((product) => (
                <ErrorBoundary key={product.id} compact>
                  <ProductCard product={product} withQty={kind === "products"} />
                </ErrorBoundary>
              ))
            ) : (
              <p className="shop-empty">{catalogLead(kind, 0)}</p>
            )}
          </div>
        </section>
      </main>
      <footer>
        <span>Gulzat · 2026</span>
        <span>
          <Link to="/">{t("footer.home")}</Link>
        </span>
      </footer>
    </>
  );
}
