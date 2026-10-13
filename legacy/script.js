/* Вставьте свою почту вместо адреса ниже */
const CONTACT_EMAIL = "YOUR_EMAIL@example.com";

const form = document.getElementById("mail");
const note = document.getElementById("form-note");
const productsGrid = document.getElementById("products-grid");
const servicesGrid = document.getElementById("services-grid");
const shopRoot = document.getElementById("shop");
const cartToggle = document.getElementById("cart-toggle");
const cartBadge = document.getElementById("cart-badge");
const cartPanel = document.getElementById("cart-panel");
const cartBackdrop = document.getElementById("cart-backdrop");
const cartClose = document.getElementById("cart-close");
const cartList = document.getElementById("cart-list");
const cartFooter = document.getElementById("cart-footer");
const cartTotal = document.getElementById("cart-total");
const cartClear = document.getElementById("cart-clear");
const cartOrderWa = document.getElementById("cart-order-wa");
const cartAddMore = document.getElementById("cart-add-more");

let activeProductCategory = "all";
let activeServiceCategory = "all";

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function i18nText(key, fallback) {
  return typeof t === "function" ? t(key) : fallback;
}

function qtyControlsHtml(id, prefix = "qty", value = 1, max = 99) {
  const qty = Math.min(max, Math.max(1, Number(value) || 1));
  const qtyLabel = i18nText("ui.qty", "Количество");
  const lessLabel = escapeHtml(i18nText("ui.less", "Меньше"));
  const moreLabel = escapeHtml(i18nText("ui.more", "Больше"));
  return `
    <div class="qty-row">
      <span>${qtyLabel}</span>
      <div class="qty-controls">
        <button type="button" class="qty-btn" data-${prefix}-minus="${escapeHtml(id)}" aria-label="${lessLabel}">−</button>
        <input class="qty-input" type="number" min="1" max="${max}" value="${qty}" data-${prefix}-for="${escapeHtml(id)}" inputmode="numeric" aria-label="${escapeHtml(qtyLabel)}" />
        <button type="button" class="qty-btn" data-${prefix}-plus="${escapeHtml(id)}" aria-label="${moreLabel}">+</button>
      </div>
    </div>`;
}

function categorySelectHtml(scope, active) {
  const list =
    typeof categoriesForType === "function"
      ? categoriesForType(scope === "service" ? "service" : "product")
      : scope === "service"
        ? SERVICE_CATEGORIES
        : PRODUCT_CATEGORIES;
  const options = [{ code: "all", label: i18nText("ui.allCategories", "Все категории") }, ...list]
    .map(
      (item) =>
        `<option value="${escapeHtml(item.code)}"${active === item.code ? " selected" : ""}>${escapeHtml(item.label)}</option>`
    )
    .join("");
  return `<select class="cat-select" data-cat-scope="${scope}" aria-label="${escapeHtml(i18nText("ui.categories", "Категории"))}">${options}</select>`;
}

function categoryIconHtml(scope, active) {
  const list =
    typeof categoriesForType === "function"
      ? categoriesForType(scope === "service" ? "service" : "product")
      : scope === "service"
        ? SERVICE_CATEGORIES
        : PRODUCT_CATEGORIES;
  const all = [{ code: "all", label: i18nText("ui.allCategories", "Все категории") }, ...list];
  const current = all.find((item) => item.code === active) || all[0];
  const items = all
    .map(
      (item) => `
      <li role="option" aria-selected="${active === item.code ? "true" : "false"}">
        <button
          type="button"
          class="cat-icon-option${active === item.code ? " is-active" : ""}"
          data-cat-scope="${escapeHtml(scope)}"
          data-cat-value="${escapeHtml(item.code)}"
        >${escapeHtml(item.label)}</button>
      </li>`
    )
    .join("");

  return `
    <div class="cat-icon-dd" data-cat-scope="${escapeHtml(scope)}">
      <button
        type="button"
        class="cat-text-btn"
        aria-label="${escapeHtml(i18nText("ui.categories", "Категории"))}"
        aria-expanded="false"
        aria-haspopup="listbox"
      >
        <span>${escapeHtml(current.label)}</span>
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
          <path fill="currentColor" d="M1 1l5 5 5-5"/>
        </svg>
      </button>
      <ul class="cat-icon-menu" role="listbox" hidden>${items}</ul>
    </div>`;
}

function readQty(root, attr = "data-qty-for") {
  const input = root?.querySelector(`.qty-input[${attr}]`);
  const value = Number(input?.value || 1);
  return Math.min(qtyInputMax(input), Math.max(1, Number.isFinite(value) ? value : 1));
}

function qtyInputMax(input) {
  const max = Number(input?.max);
  return Number.isFinite(max) && max >= 1 ? Math.min(99, max) : 99;
}

function setQty(input, value) {
  if (!input) return;
  input.value = String(Math.min(qtyInputMax(input), Math.max(1, value)));
}

function stockHtml(product) {
  const stock = productStock(product);
  if (stock === null) return "";
  if (stock === 0) {
    return `<p class="product-stock is-out">${escapeHtml(i18nText("ui.outOfStock", "Нет в наличии"))}</p>`;
  }
  const text = i18nText("ui.inStock", "В наличии: {n} шт.").replace("{n}", String(stock));
  return `<p class="product-stock">${escapeHtml(text)}</p>`;
}

function orderActionsHtml(product) {
  return `<button type="button" class="btn btn-ghost" data-order-wa="${escapeHtml(product.id)}">${i18nText("order", "Заказать")}</button>`;
}

function priceHtml(product) {
  const isService = normalizeItemType(product.itemType) === "service";
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) {
    return isService
      ? `<p class="product-price">${i18nText("feat.service.price", "Цена от 15 000 ₸ — по сложности заказа")}</p>`
      : `<p class="product-price">${i18nText("feat.product.price", "Цена от 5 000 ₸ — индивидуальные заказы")}</p>`;
  }
  return `<p class="product-price">${formatPrice(product.price, product.currency)}</p>`;
}

function cartLinePriceText(line) {
  if (line.unit > 0) return formatPrice(line.lineTotal, line.product.currency);
  return normalizeItemType(line.product.itemType) === "service"
    ? i18nText("price.fromService", "от 15 000 ₸")
    : i18nText("price.fromProduct", "от 5 000 ₸");
}

function catalogLeadText(scope, count) {
  if (!count) return i18nText(`catalog.${scope}.empty`, "");
  const forms = i18nText(`catalog.${scope}.forms`, "").split("|");
  const lang = typeof getLang === "function" ? getLang() : "ru";
  let index = 2;
  if (lang === "ru") {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) index = 0;
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) index = 1;
  } else if (count === 1) {
    index = 0;
  }
  const word = forms[index] || forms[forms.length - 1] || "";
  return i18nText(`catalog.${scope}.count`, "").replace("{n}", String(count)).replace("{word}", word);
}

function cartIconSvg() {
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="currentColor" d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 3h2.2l.5 2H21l-2.2 8.2A2 2 0 0 1 16.9 15H8.1a2 2 0 0 1-2-1.6L4.1 4H3V3zm5.1 10h8.6l1.5-5.5H7.1L8.1 13z"/>
  </svg>`;
}

function cartLineQty(id) {
  if (typeof loadCart !== "function") return 0;
  const line = loadCart().find((item) => item.id === id);
  return line ? line.qty : 0;
}

function addToCartBtnHtml(id) {
  const qty = Math.max(1, cartLineQty(id) || 1);
  const inCart = cartLineQty(id) > 0;
  const showBadge = inCart || qty > 1;
  const badge = showBadge
    ? `<span class="btn-cart-qty" aria-hidden="true">${qty > 99 ? "99+" : qty}</span>`
    : "";
  const cartWord = i18nText("ui.cart", "Корзина");
  const inCartLabel = `${i18nText("ui.inCart", "В корзине:")} ${qty}`;
  const addLabel = i18nText("ui.addCart", "В корзину");
  return `<button type="button" class="btn btn-cart-label${inCart ? " is-added" : ""}" data-add-cart="${escapeHtml(id)}" aria-label="${inCart ? inCartLabel : addLabel}" title="${inCart ? inCartLabel : addLabel}">${cartIconSvg()}<span>${cartWord}</span>${badge}</button>`;
}

function syncCartButtonQty(btn, qty, inCart) {
  if (!(btn instanceof HTMLElement)) return;
  const safeQty = Math.min(99, Math.max(1, Number(qty) || 1));
  const show = inCart || safeQty > 1;
  btn.classList.toggle("is-added", inCart);
  const inCartLabel = `${i18nText("ui.inCart", "В корзине:")} ${safeQty}`;
  const addLabel = i18nText("ui.addCart", "В корзину");
  btn.setAttribute("aria-label", inCart ? inCartLabel : `${i18nText("ui.qty", "Количество")}: ${safeQty}`);
  btn.setAttribute("title", inCart ? inCartLabel : addLabel);

  let badge = btn.querySelector(".btn-cart-qty");
  if (show) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "btn-cart-qty";
      badge.setAttribute("aria-hidden", "true");
      btn.appendChild(badge);
    }
    badge.textContent = safeQty > 99 ? "99+" : String(safeQty);
  } else if (badge) {
    badge.remove();
  }

  const span = btn.querySelector("span:not(.btn-cart-qty)");
  if (span) span.textContent = i18nText("ui.cart", "Корзина");
}

function updateCartButtons() {
  document.querySelectorAll("[data-add-cart]").forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const id = btn.getAttribute("data-add-cart");
    if (!id) return;
    const card = btn.closest(".product-card");
    const cartQty = cartLineQty(id);
    const qtyInput = card?.querySelector(".qty-input");
    const inCart = cartQty > 0;
    if (inCart && qtyInput instanceof HTMLInputElement) setQty(qtyInput, cartQty);
    const selectedQty = qtyInput ? readQty(card) : Math.max(1, cartQty || 1);
    syncCartButtonQty(btn, inCart ? cartQty : selectedQty, inCart);
  });
}

function refreshCardCartButton(card) {
  if (!card) return;
  const btn = card.querySelector("[data-add-cart]");
  if (!btn) return;
  const id = btn.getAttribute("data-add-cart");
  if (!id) return;
  const selectedQty = card.querySelector(".qty-input") ? readQty(card) : 1;
  const inCart = cartLineQty(id) > 0;
  syncCartButtonQty(btn, selectedQty, inCart);
}

function resetProductCardsCartState() {
  document.querySelectorAll(".product-card .qty-input[data-qty-for]").forEach((input) => {
    if (input instanceof HTMLInputElement) input.value = "1";
  });
  document.querySelectorAll("[data-add-cart]").forEach((btn) => {
    syncCartButtonQty(btn, 0, false);
  });
}

function productCardHtml(product, { withImage = true } = {}) {
  const cartQty = cartLineQty(product.id);
  const maxQty = maxOrderQty(product);
  const qty = Math.min(Math.max(1, maxQty), Math.max(1, cartQty || 1));
  const media = withImage
    ? `<div class="product-media">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" />
      </div>`
    : "";
  return `
    <article class="product-card${withImage ? "" : " product-card-text"}" data-id="${escapeHtml(product.id)}">
      ${media}
      <div class="product-body">
        <h3>${escapeHtml(product.name)}</h3>
        ${priceHtml(product)}
        <p class="product-desc">${escapeHtml(product.description || "")}</p>
        ${stockHtml(product)}
        ${
          maxQty > 0
            ? `${qtyControlsHtml(product.id, "qty", qty, maxQty)}
        <div class="card-actions">
          ${addToCartBtnHtml(product.id)}
          ${orderActionsHtml(product)}
        </div>`
            : ""
        }
      </div>
    </article>`;
}

function serviceCardHtml(product, { withImage = true } = {}) {
  const link = String(product.link || "").trim();
  const media = withImage
    ? `<div class="product-media">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" />
      </div>`
    : "";
  return `
    <article class="product-card${withImage ? "" : " product-card-text"}" data-id="${escapeHtml(product.id)}">
      ${media}
      <div class="product-body">
        <h3>${escapeHtml(product.name)}</h3>
        ${priceHtml(product)}
        <p class="product-desc">${escapeHtml(product.description || "")}</p>
        ${
          link
            ? `<a class="service-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(i18nText("ui.viewWork", "Смотреть работу"))}</a>`
            : ""
        }
        <div class="card-actions">
          ${addToCartBtnHtml(product.id)}
          ${orderActionsHtml(product)}
        </div>
      </div>
    </article>`;
}

function emptyWithCategory(scope, active, messageHtml) {
  return messageHtml;
}

function renderProductsCatalog() {
  const grid = document.getElementById("products-catalog-grid");
  if (!grid || typeof loadProducts !== "function") return;

  ensureCatalogProducts();

  const catPick = document.getElementById("products-page-cat");
  if (catPick) {
    catPick.innerHTML = categoryIconHtml("product", activeProductCategory);
  }

  const seedOrder = ["ready-made-sets", "product-baskets", "product-poufs", "product-photozone"];
  const goods = loadProducts().filter(
    (item) => normalizeItemType(item.itemType) === "product"
  );
  const filtered = goods.filter(
    (product) => activeProductCategory === "all" || product.category === activeProductCategory
  );

  // Свои позиции из админки — сверху, базовые примеры — ниже
  filtered.sort((a, b) => {
    const aSeed = seedOrder.includes(a.id);
    const bSeed = seedOrder.includes(b.id);
    if (aSeed !== bSeed) return aSeed ? 1 : -1;
    const ai = seedOrder.indexOf(a.id);
    const bi = seedOrder.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const lead = document.querySelector(".catalog-titles > p:not(.catalog-kicker)");
  if (lead) lead.textContent = catalogLeadText("products", filtered.length);

  if (!filtered.length) {
    grid.innerHTML = `<p class="shop-empty">${escapeHtml(catalogLeadText("products", 0))}</p>`;
  } else {
    grid.innerHTML = filtered.map(productCardHtml).join("");
  }
}

function renderServicesCatalog() {
  const grid = document.getElementById("services-catalog-grid");
  if (!grid || typeof loadProducts !== "function") return;

  ensureCatalogServices();

  const catPick = document.getElementById("services-page-cat");
  if (catPick) {
    catPick.innerHTML = categoryIconHtml("service", activeServiceCategory);
  }

  const seedOrder = ["service-sample-it", "service-sites", "service-ai-video"];
  const services = loadProducts().filter(
    (item) => normalizeItemType(item.itemType) === "service"
  );
  const filtered = services.filter(
    (product) => activeServiceCategory === "all" || product.category === activeServiceCategory
  );

  filtered.sort((a, b) => {
    const aSeed = seedOrder.includes(a.id);
    const bSeed = seedOrder.includes(b.id);
    if (aSeed !== bSeed) return aSeed ? 1 : -1;
    const ai = seedOrder.indexOf(a.id);
    const bi = seedOrder.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const lead = document.querySelector(".catalog-titles > p:not(.catalog-kicker)");
  if (lead) lead.textContent = catalogLeadText("services", filtered.length);

  if (!filtered.length) {
    grid.innerHTML = `<p class="shop-empty">${escapeHtml(catalogLeadText("services", 0))}</p>`;
  } else {
    grid.innerHTML = filtered.map(serviceCardHtml).join("");
  }
}

function renderShop() {
  renderProductsCatalog();
  renderServicesCatalog();

  if ((!productsGrid && !servicesGrid) || typeof loadProducts !== "function") return;

  ensureCatalogServices();
  ensureCatalogProducts();

  const productsFeature = document.querySelector(".products-feature");
  if (productsFeature) productsFeature.hidden = false;
  const servicesFeature = document.querySelector(".services-feature");
  if (servicesFeature) servicesFeature.hidden = false;

  // На главной только два окна. Товары/услуги из админки — на products.html и services.html
  if (productsGrid) productsGrid.innerHTML = "";
  if (servicesGrid) servicesGrid.innerHTML = "";
}

function updateCartBadge() {
  const count = cartCount();
  if (!cartBadge) return;
  if (count > 0) {
    cartBadge.hidden = false;
    cartBadge.textContent = String(count);
  } else {
    cartBadge.hidden = true;
    cartBadge.textContent = "0";
  }
}

function renderCart() {
  if (!cartList) return;
  if (typeof loadProducts === "function" && typeof loadCart === "function" && typeof saveCart === "function") {
    const products = loadProducts();
    const cart = loadCart();
    const pruned = cart.flatMap((item) => {
      const product = products.find((p) => p.id === item.id);
      const qty = product ? Math.min(item.qty, maxOrderQty(product)) : 0;
      return qty > 0 ? [{ id: item.id, qty }] : [];
    });
    if (JSON.stringify(pruned) !== JSON.stringify(cart)) saveCart(pruned);
  }
  const lines = getCartLines();
  updateCartBadge();

  if (!lines.length) {
    cartList.innerHTML = `<p class="cart-empty">${i18nText("cart.empty", "Корзина пуста. Добавьте товары из магазина.")}</p>`;
    if (cartFooter) cartFooter.hidden = true;
    if (cartTotal) cartTotal.textContent = "";
    resetProductCardsCartState();
    return;
  }

  updateCartButtons();

  cartList.innerHTML = lines
    .map(
      (line) => `
      <article class="cart-item" data-cart-id="${escapeHtml(line.product.id)}">
        <img src="${escapeHtml(line.product.image)}" alt="" />
        <div class="cart-item-body">
          <h3>${escapeHtml(line.product.name)}</h3>
          <p class="cart-item-price">${escapeHtml(cartLinePriceText(line))}</p>
          <div class="qty-controls cart-qty">
            <button type="button" class="qty-btn" data-cart-minus="${escapeHtml(line.product.id)}" aria-label="${escapeHtml(i18nText("ui.less", "Меньше"))}">−</button>
            <input class="qty-input" type="number" min="1" max="${maxOrderQty(line.product)}" value="${line.qty}" data-cart-qty="${escapeHtml(line.product.id)}" inputmode="numeric" aria-label="${escapeHtml(i18nText("ui.qty", "Количество"))}" />
            <button type="button" class="qty-btn" data-cart-plus="${escapeHtml(line.product.id)}" aria-label="${escapeHtml(i18nText("ui.more", "Больше"))}">+</button>
          </div>
          <button type="button" class="cart-remove" data-cart-remove="${escapeHtml(line.product.id)}">${escapeHtml(i18nText("cart.remove", "Удалить"))}</button>
        </div>
      </article>`
    )
    .join("");

  if (cartFooter) cartFooter.hidden = false;
  if (cartTotal) {
    const byCurrency = {};
    lines.forEach((line) => {
      if (line.unit <= 0) return;
      const code = normalizeCurrency(line.product.currency);
      byCurrency[code] = (byCurrency[code] || 0) + line.lineTotal;
    });
    const totalText = Object.entries(byCurrency)
      .map(([code, sum]) => formatPrice(sum, code))
      .join(" · ");
    const hasOpenPrice = lines.some((line) => line.unit <= 0);
    const totalHtml = totalText ? escapeHtml(`${i18nText("cart.total", "Итого:")} ${totalText}`) : "";
    const noteText = !totalText
      ? i18nText("cart.allOpen", "Стоимость подтвердит Гульзат после уточнения деталей.")
      : hasOpenPrice
        ? i18nText("cart.plusOpen", "+ позиции «от …» — точную сумму подтвердит Гульзат")
        : "";
    cartTotal.innerHTML = `${totalHtml}${noteText ? `<span class="cart-total-note">${escapeHtml(noteText)}</span>` : ""}`;
  }
}

function openCart() {
  cartPanel?.classList.add("is-open");
  cartBackdrop?.removeAttribute("hidden");
  if (cartPanel) cartPanel.setAttribute("aria-hidden", "false");
  cartToggle?.setAttribute("aria-expanded", "true");
  document.body.classList.add("cart-open");
  renderCart();
}

function closeCart() {
  cartPanel?.classList.remove("is-open");
  cartBackdrop?.setAttribute("hidden", "");
  if (cartPanel) cartPanel.setAttribute("aria-hidden", "true");
  cartToggle?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("cart-open");
}

let checkoutModal = null;
let pendingCheckout = null;

function ensureCheckoutModal() {
  if (checkoutModal) return checkoutModal;
  const wrap = document.createElement("div");
  wrap.className = "checkout-modal";
  wrap.id = "checkout-modal";
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="checkout-backdrop" data-checkout-close></div>
    <div class="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <button type="button" class="checkout-close" data-checkout-close>×</button>
      <h2 id="checkout-title"></h2>
      <p class="checkout-lead" id="checkout-lead"></p>
      <ul class="checkout-summary" id="checkout-summary"></ul>
      <form class="checkout-form" id="checkout-form" novalidate>
        <label>
          <span id="checkout-name-label"></span>
          <input type="text" id="checkout-name" maxlength="80" autocomplete="name" required />
        </label>
        <label>
          <span id="checkout-phone-label"></span>
          <input type="tel" id="checkout-phone" maxlength="20" autocomplete="tel" inputmode="tel" placeholder="+7 777 123 45 67" required />
        </label>
        <label id="checkout-color-wrap">
          <span><span id="checkout-color-label"></span> <small class="checkout-optional"></small></span>
          <input type="text" id="checkout-color" maxlength="80" autocomplete="off" />
        </label>
        <label>
          <span><span id="checkout-date-label"></span> <small class="checkout-optional"></small></span>
          <input type="date" id="checkout-date" />
        </label>
        <label>
          <span><span id="checkout-comment-label"></span> <small class="checkout-optional"></small></span>
          <textarea id="checkout-comment" rows="2" maxlength="500"></textarea>
        </label>
        <p class="checkout-terms"><span id="checkout-terms"></span> <a id="checkout-terms-link" href="${document.getElementById("delivery") ? "#delivery" : "./index.html#delivery"}" data-checkout-close></a></p>
        <p class="checkout-error" id="checkout-error" role="alert"></p>
        <button type="submit" class="btn checkout-submit" id="checkout-submit"></button>
      </form>
    </div>`;
  document.body.appendChild(wrap);

  wrap.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-checkout-close]")) closeCheckout();
  });
  wrap.querySelector("#checkout-form")?.addEventListener("submit", submitCheckout);
  wrap.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => setCheckoutError(""));
  });

  checkoutModal = wrap;
  return wrap;
}

function setCheckoutError(text) {
  const el = checkoutModal?.querySelector("#checkout-error");
  if (el) el.textContent = text;
}

function checkoutSummaryItems(checkout) {
  if (checkout.source === "cart") {
    return getCartLines().map((line) => ({ name: line.product.name, qty: line.qty }));
  }
  return [{ name: checkout.product.name, qty: checkout.qty }];
}

function checkoutHasProducts(checkout) {
  if (checkout.source === "cart") {
    return getCartLines().some((line) => normalizeItemType(line.product.itemType) !== "service");
  }
  return normalizeItemType(checkout.product?.itemType) !== "service";
}

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isCheckoutOpen() {
  return Boolean(checkoutModal && !checkoutModal.hidden);
}

function openCheckout(checkout) {
  const modal = ensureCheckoutModal();
  pendingCheckout = checkout;

  modal.querySelector("#checkout-title").textContent = i18nText("checkout.title", "Оформление заказа");
  modal.querySelector("#checkout-lead").textContent = i18nText(
    "checkout.lead",
    "Оставьте имя и телефон — Гульзат свяжется с вами и подтвердит заказ."
  );
  modal.querySelector("#checkout-name-label").textContent = i18nText("checkout.name", "Ваше имя");
  modal.querySelector("#checkout-phone-label").textContent = i18nText("checkout.phone", "Номер телефона");
  modal.querySelector("#checkout-submit").textContent = i18nText("checkout.submitWa", "Перейти в WhatsApp");
  const closeBtn = modal.querySelector(".checkout-close");
  closeBtn?.setAttribute("aria-label", i18nText("checkout.close", "Закрыть"));

  modal.querySelector("#checkout-summary").innerHTML = checkoutSummaryItems(checkout)
    .map(
      (item) =>
        `<li><span>${escapeHtml(item.name)}</span><span>× ${escapeHtml(item.qty)}</span></li>`
    )
    .join("");

  const saved = loadCustomer();
  const nameInput = modal.querySelector("#checkout-name");
  const phoneInput = modal.querySelector("#checkout-phone");
  nameInput.placeholder = i18nText("checkout.namePh", "Например: Айгерим");
  nameInput.value = saved.name;
  phoneInput.value = saved.phone ? formatPhone(saved.phone) : "";

  modal.querySelector("#checkout-color-label").textContent = i18nText("checkout.color", "Цвет и пожелания");
  modal.querySelector("#checkout-date-label").textContent = i18nText("checkout.dueDate", "К какой дате нужно");
  modal.querySelector("#checkout-comment-label").textContent = i18nText("checkout.comment", "Комментарий");
  modal.querySelectorAll(".checkout-optional").forEach((el) => {
    el.textContent = `(${i18nText("checkout.optional", "необязательно")})`;
  });
  modal.querySelector("#checkout-terms").textContent = i18nText(
    "checkout.terms",
    "Оплата — 100% предоплата. Доставка по городу и по Казахстану."
  );
  modal.querySelector("#checkout-terms-link").textContent = i18nText("checkout.termsLink", "Подробнее");
  const colorInput = modal.querySelector("#checkout-color");
  const dateInput = modal.querySelector("#checkout-date");
  const commentInput = modal.querySelector("#checkout-comment");
  modal.querySelector("#checkout-color-wrap").hidden = !checkoutHasProducts(checkout);
  colorInput.placeholder = i18nText("checkout.colorPh", "Например: бордо с золотом");
  commentInput.placeholder = i18nText("checkout.commentPh", "Размер, количество гостей, повод — всё, что важно");
  colorInput.value = "";
  dateInput.value = "";
  dateInput.min = todayIso();
  commentInput.value = "";
  setCheckoutError("");

  modal.hidden = false;
  document.body.classList.add("checkout-open");
  requestAnimationFrame(() => (saved.name ? phoneInput : nameInput).focus());
}

function closeCheckout() {
  if (!checkoutModal) return;
  checkoutModal.hidden = true;
  document.body.classList.remove("checkout-open");
  pendingCheckout = null;
}

function submitCheckout(event) {
  event.preventDefault();
  const checkout = pendingCheckout;
  if (!checkout || !checkoutModal) return;

  const nameInput = checkoutModal.querySelector("#checkout-name");
  const phoneInput = checkoutModal.querySelector("#checkout-phone");
  const name = nameInput.value.trim();
  const phone = normalizePhone(phoneInput.value);
  if (!name) {
    setCheckoutError(i18nText("checkout.errName", "Введите имя."));
    nameInput.focus();
    return;
  }
  if (!phone) {
    setCheckoutError(i18nText("checkout.errPhone", "Введите номер телефона полностью, например +7 777 123 45 67."));
    phoneInput.focus();
    return;
  }

  const colorWrap = checkoutModal.querySelector("#checkout-color-wrap");
  const dateInput = checkoutModal.querySelector("#checkout-date");
  const dueDate = dateInput.value;
  if (dueDate && dueDate < todayIso()) {
    setCheckoutError(i18nText("checkout.errDate", "Дата не может быть в прошлом."));
    dateInput.focus();
    return;
  }
  const wishes = {
    color: colorWrap.hidden ? "" : checkoutModal.querySelector("#checkout-color").value.trim(),
    dueDate,
    comment: checkoutModal.querySelector("#checkout-comment").value.trim(),
  };

  const customer = { name, phone };
  saveCustomer(customer);

  const fromCart = checkout.source === "cart";
  const items = fromCart
    ? orderItemsFromCart()
    : [orderItemFromProduct(checkout.product, checkout.qty)];
  sendOrderToCrm({ customer, channel: "whatsapp", source: checkout.source, items, wishes });
  closeCheckout();

  const url = fromCart
    ? cartWhatsAppUrl(loadCart(), customer, wishes)
    : orderWhatsAppUrl(checkout.product, checkout.qty, customer, wishes);
  if (fromCart) {
    clearCart();
    renderCart();
    closeCart();
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

let contactModal = null;

function ensureContactModal() {
  if (contactModal) return contactModal;
  const phone = typeof PHONE === "string" ? PHONE : "77051406940";
  const phoneLabel = typeof formatPhone === "function" ? formatPhone(phone) : `+${phone}`;
  const mailHref = document.getElementById("mail") ? "#mail" : "./index.html#mail";
  const wrap = document.createElement("div");
  wrap.className = "checkout-modal contact-modal";
  wrap.id = "contact-modal";
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="checkout-backdrop" data-contact-close></div>
    <div class="checkout-dialog contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
      <button type="button" class="checkout-close" data-contact-close>×</button>
      <div class="contact-dialog-mark" aria-hidden="true">G</div>
      <h2 id="contact-modal-title"></h2>
      <p class="checkout-lead" id="contact-modal-lead"></p>
      <a class="contact-dialog-phone" href="tel:+${escapeHtml(phone)}">${escapeHtml(phoneLabel)}</a>
      <div class="contact-dialog-links">
        <a class="btn" href="https://wa.me/${escapeHtml(phone)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>
      <a class="contact-dialog-mail" id="contact-modal-mail" href="${mailHref}" data-contact-close></a>
    </div>`;
  document.body.appendChild(wrap);
  if (!mailConfigured) {
    wrap.querySelector("#contact-modal-mail")?.setAttribute("hidden", "");
  }

  wrap.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-contact-close]")) closeContact();
  });

  contactModal = wrap;
  return wrap;
}

function fillContactModal() {
  if (!contactModal) return;
  contactModal.querySelector("#contact-modal-title").textContent = i18nText("contact.popup.title", "Связаться со мной");
  contactModal.querySelector("#contact-modal-lead").textContent = i18nText(
    "contact.popup.lead",
    "Выберите удобный способ — отвечу как можно скорее."
  );
  contactModal.querySelector("#contact-modal-mail").textContent = i18nText("contact.mail.title", "Написать на почту");
  contactModal.querySelector(".checkout-close")?.setAttribute("aria-label", i18nText("checkout.close", "Закрыть"));
}

let contactCloseTimer = 0;
let contactAnchor = null;

function isContactOpen() {
  return Boolean(contactModal && !contactModal.hidden && !contactModal.classList.contains("is-closing"));
}

function positionContact() {
  if (!isContactOpen() || !contactAnchor) return;
  const dialog = contactModal.querySelector(".contact-dialog");
  const rect = contactAnchor.getBoundingClientRect();
  const gap = 12;
  const margin = 12;
  const viewW = document.documentElement.clientWidth;
  const viewH = window.innerHeight;
  const width = dialog.offsetWidth;
  const height = dialog.offsetHeight;
  const center = rect.left + rect.width / 2;
  const left = Math.max(margin, Math.min(center - width / 2, viewW - width - margin));
  const spaceBelow = viewH - rect.bottom - gap - margin;
  const above = spaceBelow < height && rect.top - gap - margin > spaceBelow;
  const top = above ? Math.max(margin, rect.top - gap - height) : rect.bottom + gap;

  dialog.style.left = `${left}px`;
  dialog.style.top = `${top}px`;
  dialog.style.setProperty("--contact-arrow", `${Math.max(20, Math.min(center - left, width - 20))}px`);
  contactModal.classList.toggle("is-above", above);
}

function openContact(anchor) {
  const modal = ensureContactModal();
  clearTimeout(contactCloseTimer);
  modal.classList.remove("is-closing");
  closeCart();
  fillContactModal();
  contactAnchor = anchor || null;
  modal.hidden = false;
  positionContact();
  document.body.classList.add("checkout-open");
  requestAnimationFrame(() => modal.querySelector(".contact-dialog-links .btn")?.focus({ preventScroll: true }));
}

function closeContact() {
  if (!isContactOpen()) return;
  const modal = contactModal;
  modal.classList.add("is-closing");
  document.body.classList.remove("checkout-open");
  contactCloseTimer = setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("is-closing");
  }, 220);
}

document.querySelectorAll("[data-contact-open]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openContact(link);
  });
});

window.addEventListener("resize", positionContact);

shopRoot?.addEventListener("change", (event) => {
  const target = event.target;

  if (target instanceof HTMLInputElement && target.classList.contains("qty-input") && target.hasAttribute("data-qty-for")) {
    const card = target.closest(".product-card");
    const id = target.getAttribute("data-qty-for");
    const nextQty = readQty(card);
    refreshCardCartButton(card);
    if (id && cartLineQty(id) > 0) {
      setCartQty(id, nextQty);
      updateCartBadge();
      if (cartPanel?.classList.contains("is-open")) renderCart();
    }
    return;
  }

  if (!(target instanceof HTMLSelectElement) || !target.classList.contains("cat-select")) return;
  const scope = target.getAttribute("data-cat-scope");
  const value = target.value || "all";
  if (scope === "product") activeProductCategory = value;
  else if (scope === "service") activeServiceCategory = value;
  else return;
  renderShop();
});

shopRoot?.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const iconBtn = target.closest(".cat-icon-btn, .cat-text-btn");
  if (iconBtn) {
    event.preventDefault();
    const dd = iconBtn.closest(".cat-icon-dd");
    const menu = dd?.querySelector(".cat-icon-menu");
    const open = menu && !menu.hasAttribute("hidden");
    document.querySelectorAll(".cat-icon-menu").forEach((el) => el.setAttribute("hidden", ""));
    document.querySelectorAll(".cat-icon-btn, .cat-text-btn").forEach((el) => el.setAttribute("aria-expanded", "false"));
    if (menu && !open) {
      menu.removeAttribute("hidden");
      iconBtn.setAttribute("aria-expanded", "true");
    }
    return;
  }

  const iconOption = target.closest(".cat-icon-option");
  if (iconOption) {
    event.preventDefault();
    const scope = iconOption.getAttribute("data-cat-scope");
    const value = iconOption.getAttribute("data-cat-value") || "all";
    if (scope === "product") activeProductCategory = value;
    else if (scope === "service") activeServiceCategory = value;
    else return;
    renderShop();
    return;
  }

  const minus = target.closest("[data-qty-minus]");
  const plus = target.closest("[data-qty-plus]");
  if (minus || plus) {
    event.preventDefault();
    const key = minus?.getAttribute("data-qty-minus") || plus?.getAttribute("data-qty-plus");
    const card = target.closest(".product-card");
    const input = card?.querySelector(`.qty-input[data-qty-for="${CSS.escape(key || "")}"]`);
    const current = Number(input?.value || 1);
    setQty(input, current + (minus ? -1 : 1));
    const nextQty = readQty(card);
    refreshCardCartButton(card);
    if (key && cartLineQty(key) > 0) {
      setCartQty(key, nextQty);
      updateCartBadge();
      if (cartPanel?.classList.contains("is-open")) renderCart();
    }
    return;
  }

  const addBtn = target.closest("[data-add-cart]");
  if (addBtn) {
    event.preventDefault();
    const id = addBtn.getAttribute("data-add-cart");
    if (!id) return;
    const card = target.closest(".product-card");
    const hasQtyInput = Boolean(card?.querySelector(".qty-input"));
    if (cartLineQty(id) > 0) {
      if (hasQtyInput) setCartQty(id, readQty(card));
    } else {
      addToCart(id, hasQtyInput ? readQty(card) : 1);
    }
    updateCartBadge();
    refreshCardCartButton(card);
    return;
  }

  const waBtn = target.closest("[data-order-wa]");
  if (waBtn) {
    event.preventDefault();
    const id = waBtn.getAttribute("data-order-wa");
    ensureCatalogProducts();
    ensureCatalogServices();
    const card = target.closest(".product-card");
    const product = loadProducts().find((item) => item.id === id);
    if (!product || maxOrderQty(product) <= 0) return;
    const qty = card?.querySelector(".qty-input") ? readQty(card) : 1;
    openCheckout({
      channel: "whatsapp",
      source: "product",
      product,
      qty,
    });
  }
});

cartToggle?.addEventListener("click", () => {
  if (cartPanel?.classList.contains("is-open")) closeCart();
  else openCart();
});

cartClose?.addEventListener("click", closeCart);
cartBackdrop?.addEventListener("click", closeCart);

cartList?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const minus = target.closest("[data-cart-minus]");
  const plus = target.closest("[data-cart-plus]");
  if (minus || plus) {
    const id = minus?.getAttribute("data-cart-minus") || plus?.getAttribute("data-cart-plus");
    if (!id) return;
    const input = cartList.querySelector(`.qty-input[data-cart-qty="${CSS.escape(id)}"]`);
    const current = Number(input?.value || 1);
    const next = Math.min(99, Math.max(1, current + (minus ? -1 : 1)));
    setCartQty(id, next);
    renderCart();
    return;
  }

  const removeBtn = target.closest("[data-cart-remove]");
  if (removeBtn) {
    const id = removeBtn.getAttribute("data-cart-remove");
    removeFromCart(id);
    renderCart();
    updateCartButtons();
  }
});

cartList?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.hasAttribute("data-cart-qty")) return;
  const id = target.getAttribute("data-cart-qty");
  setCartQty(id, Math.max(1, Number(target.value) || 1));
  renderCart();
});

cartClear?.addEventListener("click", () => {
  clearCart();
  resetProductCardsCartState();
  renderCart();
});

cartAddMore?.addEventListener("click", (event) => {
  const onProductsPage =
    document.body.classList.contains("products-page") &&
    Boolean(document.getElementById("products-catalog-grid"));
  if (onProductsPage) {
    event.preventDefault();
    closeCart();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  closeCart();
});

cartOrderWa?.addEventListener("click", () => {
  if (!getCartLines().length) return;
  openCheckout({ channel: "whatsapp", source: "cart" });
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(".cat-icon-dd")) {
    document.querySelectorAll(".cat-icon-menu").forEach((el) => el.setAttribute("hidden", ""));
    document.querySelectorAll(".cat-icon-btn, .cat-text-btn").forEach((el) => el.setAttribute("aria-expanded", "false"));
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (isContactOpen()) {
    closeContact();
    return;
  }
  if (isCheckoutOpen()) {
    closeCheckout();
    return;
  }
  closeCart();
});

shopRoot?.addEventListener(
  "wheel",
  (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.classList.contains("qty-input") &&
      document.activeElement === target
    ) {
      event.preventDefault();
    }
  },
  { passive: false }
);

const mailConfigured = Boolean(CONTACT_EMAIL) && !CONTACT_EMAIL.includes("example.com");
if (form && !mailConfigured) form.hidden = true;

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!mailConfigured) return;

  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const message = String(data.get("message") || "").trim();

  const subject = encodeURIComponent(`Заявка с сайта — ${name}`);
  const body = encodeURIComponent(`Имя: ${name}\nEmail: ${email}\n\n${message}`);

  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  note.textContent = "Откроется почтовая программа с готовым письмом.";
  form.reset();
});

const siteNav = document.querySelector("header.nav");
const navSpyLinks = Array.from(document.querySelectorAll('.nav-actions a.pill[href^="#"]'))
  .map((link) => ({ link, section: document.querySelector(link.getAttribute("href")) }))
  .filter((item) => item.section);

function updateNavOnScroll() {
  if (!siteNav) return;
  const navHeight = siteNav.offsetHeight;
  document.documentElement.style.setProperty("--nav-h", `${navHeight}px`);
  siteNav.classList.toggle("is-scrolled", window.scrollY > 10);

  if (!navSpyLinks.length) return;
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  let current = navSpyLinks[0];
  if (atBottom) {
    current = navSpyLinks[navSpyLinks.length - 1];
  } else {
    for (const item of navSpyLinks) {
      if (item.section.getBoundingClientRect().top <= navHeight + 80) current = item;
    }
  }
  navSpyLinks.forEach((item) => {
    const active = item === current;
    item.link.classList.toggle("is-active", active);
    if (active) item.link.setAttribute("aria-current", "location");
    else item.link.removeAttribute("aria-current");
  });
}

window.addEventListener("scroll", updateNavOnScroll, { passive: true });
window.addEventListener("resize", updateNavOnScroll);
updateNavOnScroll();

renderShop();
updateCartBadge();
renderCart();
if (typeof flushPendingOrders === "function") flushPendingOrders();
if (typeof syncCatalogFromServer === "function") syncCatalogFromServer();

document.addEventListener("gulzat:catalog", () => {
  renderShop();
  updateCartBadge();
  renderCart();
});

window.addEventListener("pageshow", () => {
  renderShop();
  updateCartBadge();
  renderCart();
});

window.addEventListener("focus", () => {
  renderShop();
  updateCartBadge();
  if (typeof syncCatalogFromServer === "function") syncCatalogFromServer();
});

window.addEventListener("storage", (event) => {
  if (event.key === PRODUCTS_KEY || event.key === CART_KEY || event.key === null) {
    renderShop();
    updateCartBadge();
    renderCart();
  }
});

document.addEventListener("gulzat:lang", () => {
  fillContactModal();
  positionContact();
  renderShop();
  renderCart();
  if (typeof renderProductsCatalog === "function") renderProductsCatalog();
  if (typeof renderServicesCatalog === "function") renderServicesCatalog();
});
