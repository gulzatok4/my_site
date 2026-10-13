const PRODUCTS_KEY = "gulzat_products_v2";
const CATEGORIES_KEY = "gulzat_categories_v1";
const HIDDEN_CATEGORIES_KEY = "gulzat_hidden_categories_v1";
const REMOVED_SEEDS_KEY = "gulzat_removed_seeds_v1";
const PHONE = "77051406940";

const CURRENCIES = {
  kzt: { code: "kzt", symbol: "₸", label: "Тенге (₸)" },
  rub: { code: "rub", symbol: "₽", label: "Рубли (₽)" },
  usd: { code: "usd", symbol: "$", label: "Доллар ($)" },
};

const PRODUCT_CATEGORIES = [
  { code: "baskets", label: "Национальные корзины" },
  { code: "wedding", label: "Свадебные наборы" },
  { code: "poufs", label: "Пуфы" },
  { code: "chests", label: "Сундуки" },
  { code: "jewelry", label: "Украшения" },
];

const SERVICE_CATEGORIES = [
  { code: "it-systems", label: "IT-системы и CRM" },
  { code: "sites", label: "Сайты" },
  { code: "bots", label: "Боты" },
  { code: "ai-video", label: "ИИ-ролики" },
];

/** @deprecated use PRODUCT_CATEGORIES — kept for older admin markup */
const CATEGORIES = PRODUCT_CATEGORIES;

const ITEM_TYPES = [
  { code: "product", label: "Товар" },
  { code: "service", label: "Услуга" },
];

function loadCustomCategories() {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        code: String(item.code || "").trim().toLowerCase(),
        label: String(item.label || "").trim(),
        itemType: normalizeItemType(item.itemType),
      }))
      .filter((item) => item.code && item.label);
  } catch {
    return [];
  }
}

function saveCustomCategories(list) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(list));
  scheduleCatalogPush();
}

function loadHiddenCategories() {
  try {
    const raw = localStorage.getItem(HIDDEN_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((code) => String(code || "").trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

function saveHiddenCategories(list) {
  localStorage.setItem(HIDDEN_CATEGORIES_KEY, JSON.stringify(list));
  scheduleCatalogPush();
}

function loadRemovedSeeds() {
  try {
    const raw = localStorage.getItem(REMOVED_SEEDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => String(id || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function saveRemovedSeeds(list) {
  localStorage.setItem(REMOVED_SEEDS_KEY, JSON.stringify(list));
  scheduleCatalogPush();
}

function isSeedRemoved(id) {
  const key = String(id || "").trim();
  if (!key) return false;
  return loadRemovedSeeds().includes(key);
}

function markSeedRemoved(id) {
  const key = String(id || "").trim();
  if (!key) return;
  const list = loadRemovedSeeds();
  if (!list.includes(key)) saveRemovedSeeds([...list, key]);
}

function markSeedsRemoved(ids) {
  const next = new Set(loadRemovedSeeds());
  (ids || []).forEach((id) => {
    const key = String(id || "").trim();
    if (key) next.add(key);
  });
  saveRemovedSeeds([...next]);
}

function clearRemovedSeeds() {
  saveRemovedSeeds([]);
}

function restoreDefaultCatalog() {
  clearRemovedSeeds();
  ensureCatalogProducts();
  ensureCatalogServices();
  return loadProducts();
}

function categoriesForType(itemType) {
  const type = normalizeItemType(itemType);
  const hidden = new Set(loadHiddenCategories());
  const base = type === "service" ? SERVICE_CATEGORIES : PRODUCT_CATEGORIES;
  const custom = loadCustomCategories()
    .filter((item) => item.itemType === type)
    .map((item) => ({ code: item.code, label: item.label }));
  return [...base, ...custom].filter((item) => !hidden.has(item.code));
}

function allCategories() {
  return [
    ...PRODUCT_CATEGORIES,
    ...SERVICE_CATEGORIES,
    ...loadCustomCategories().map((item) => ({ code: item.code, label: item.label })),
  ];
}

function addCustomCategory(label, itemType = "product") {
  const name = String(label || "").trim().replace(/\s+/g, " ");
  if (!name) return null;
  const type = normalizeItemType(itemType);
  const existing = categoriesForType(type).find(
    (item) => item.label.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing;

  const code = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const next = [...loadCustomCategories(), { code, label: name, itemType: type }];
  saveCustomCategories(next);
  return { code, label: name };
}

function isCustomCategory(code) {
  const key = String(code || "").toLowerCase();
  return loadCustomCategories().some((item) => item.code === key);
}

function removeCategory(code, itemType = "product") {
  const key = String(code || "").toLowerCase();
  const type = normalizeItemType(itemType);
  const list = categoriesForType(type);
  const current = list.find((item) => item.code === key);
  if (!current) return { ok: false, reason: "missing" };
  if (list.length <= 1) return { ok: false, reason: "last", label: current.label };

  const fallback = list.find((item) => item.code !== key)?.code;
  if (!fallback) return { ok: false, reason: "last", label: current.label };

  if (isCustomCategory(key)) {
    saveCustomCategories(loadCustomCategories().filter((item) => item.code !== key));
  } else {
    const hidden = loadHiddenCategories();
    if (!hidden.includes(key)) saveHiddenCategories([...hidden, key]);
  }

  if (typeof loadProducts === "function" && typeof saveProducts === "function") {
    const products = loadProducts();
    let changed = false;
    const updated = products.map((product) => {
      if (String(product.category || "").toLowerCase() !== key) return product;
      changed = true;
      return { ...product, category: fallback };
    });
    if (changed) saveProducts(updated);
  }

  return { ok: true, label: current.label, fallback };
}

/** @deprecated use removeCategory */
function removeCustomCategory(code) {
  return removeCategory(code).ok;
}

const SEED_PRODUCTS = [];

function normalizeCurrency(code) {
  const key = String(code || "kzt").toLowerCase();
  return CURRENCIES[key] ? key : "kzt";
}

function normalizeCategory(code, itemType = "product") {
  const key = String(code || "").toLowerCase();
  const list = categoriesForType(itemType);
  if (list.some((item) => item.code === key)) return key;
  return list[0].code;
}

function categoryLabel(code, itemType = "product") {
  const key = String(code || "").toLowerCase();
  const found = allCategories().find((item) => item.code === key);
  if (found) return found.label;
  return categoriesForType(itemType)[0].label;
}

function normalizeItemType(code) {
  const key = String(code || "").toLowerCase();
  return ITEM_TYPES.some((item) => item.code === key) ? key : "product";
}

function itemTypeLabel(code) {
  const found = ITEM_TYPES.find((item) => item.code === normalizeItemType(code));
  return found ? found.label : ITEM_TYPES[0].label;
}

function formatPrice(value, currency = "kzt") {
  const code = normalizeCurrency(currency);
  const symbol = CURRENCIES[code].symbol;
  const amount = Number(value).toLocaleString("ru-RU");
  if (code === "usd") return `${symbol}${amount}`;
  return `${amount} ${symbol}`;
}

function loadProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (!raw) {
      saveProducts([]);
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      saveProducts([]);
      return [];
    }
    return parsed.map((p) => {
      const itemType = normalizeItemType(p.itemType);
      return {
        ...p,
        currency: normalizeCurrency(p.currency),
        itemType,
        category: normalizeCategory(p.category, itemType),
        link: String(p.link || "").trim(),
      };
    });
  } catch {
    saveProducts([]);
    return [];
  }
}

function saveProducts(products) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  scheduleCatalogPush();
}

/** null — без ограничения, 0 — нет в наличии */
function productStock(product) {
  if (normalizeItemType(product?.itemType) === "service") return null;
  const raw = product?.stock;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function maxOrderQty(product) {
  const stock = productStock(product);
  return stock === null ? 99 : Math.min(99, stock);
}

function maxOrderQtyById(productId) {
  const product = loadProducts().find((item) => item.id === productId);
  return product ? maxOrderQty(product) : 99;
}

const CATALOG_API = "/api/catalog";
const CATALOG_SYNCED_KEY = "gulzat_catalog_synced_v1";
let catalogPushEnabled = false;
let catalogPushListener = null;
let catalogPushTimer = 0;
let lastCatalogJson = null;

function catalogSnapshot() {
  return {
    products: loadProducts(),
    categories: loadCustomCategories(),
    hiddenCategories: loadHiddenCategories(),
    removedSeeds: loadRemovedSeeds(),
  };
}

function catalogStorageJson() {
  return [PRODUCTS_KEY, CATEGORIES_KEY, HIDDEN_CATEGORIES_KEY, REMOVED_SEEDS_KEY]
    .map((key) => localStorage.getItem(key))
    .join("\n");
}

function applyServerCatalog(catalog) {
  const list = (value) => (Array.isArray(value) ? value : []);
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list(catalog.products)));
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(list(catalog.categories)));
  localStorage.setItem(HIDDEN_CATEGORIES_KEY, JSON.stringify(list(catalog.hiddenCategories)));
  localStorage.setItem(REMOVED_SEEDS_KEY, JSON.stringify(list(catalog.removedSeeds)));
}

/** Позиции, которые были только в этом браузере до переноса каталога на сервер */
function mergeLocalIntoCatalog(catalog) {
  const removed = new Set((catalog.removedSeeds || []).map(String));
  const serverIds = new Set(catalog.products.map((item) => String(item?.id || "")));
  const localOnly = loadProducts().filter((item) => !serverIds.has(item.id) && !removed.has(item.id));
  const serverCategories = Array.isArray(catalog.categories) ? catalog.categories : [];
  const codes = new Set(serverCategories.map((item) => String(item?.code || "")));
  const localCategories = loadCustomCategories().filter((item) => !codes.has(item.code));
  return {
    catalog: {
      ...catalog,
      products: [...localOnly, ...catalog.products],
      categories: [...serverCategories, ...localCategories],
    },
    merged: localOnly.length > 0 || localCategories.length > 0,
  };
}

/** { ok, empty, merged }; ok=false — сервер недоступен, работаем с копией в браузере */
function syncCatalogFromServer({ mergeLocalOnce = false } = {}) {
  if (location.protocol === "file:") return Promise.resolve({ ok: false });
  return fetch(CATALOG_API, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`http_${res.status}`))))
    .then((data) => {
      if (!data || !("catalog" in data)) throw new Error("bad_response");
      const firstSync = mergeLocalOnce && !localStorage.getItem(CATALOG_SYNCED_KEY);
      if (mergeLocalOnce) localStorage.setItem(CATALOG_SYNCED_KEY, "1");
      let catalog = data.catalog;
      if (!catalog || !Array.isArray(catalog.products)) return { ok: true, empty: true, merged: false };

      let merged = false;
      if (firstSync) ({ catalog, merged } = mergeLocalIntoCatalog(catalog));
      const before = catalogStorageJson();
      applyServerCatalog(catalog);
      lastCatalogJson = merged ? null : JSON.stringify(catalogSnapshot());
      if (catalogStorageJson() !== before) document.dispatchEvent(new Event("gulzat:catalog"));
      return { ok: true, empty: false, merged };
    })
    .catch(() => ({ ok: false }));
}

/** "ok" | "unauthorized" | "error" | "offline" | "unchanged" */
function pushCatalogToServer() {
  const json = JSON.stringify(catalogSnapshot());
  if (json === lastCatalogJson) return Promise.resolve("unchanged");
  const headers = { "Content-Type": "application/json" };
  let key = "";
  try {
    key = sessionStorage.getItem("gulzat_admin_key") || "";
  } catch {
    /* ignore */
  }
  if (key) headers["X-Admin-Key"] = encodeURIComponent(key);
  return fetch(CATALOG_API, { method: "PUT", headers, body: json, cache: "no-store" })
    .then((res) => {
      if (res.ok) {
        lastCatalogJson = json;
        return "ok";
      }
      return res.status === 401 ? "unauthorized" : "error";
    })
    .catch(() => "offline");
}

function scheduleCatalogPush() {
  if (!catalogPushEnabled) return;
  clearTimeout(catalogPushTimer);
  catalogPushTimer = setTimeout(() => {
    pushCatalogToServer().then((result) => catalogPushListener?.(result));
  }, 300);
}

/** Только для админки: изменения каталога отправляются на сервер */
function enableCatalogPush(listener) {
  catalogPushEnabled = true;
  catalogPushListener = typeof listener === "function" ? listener : null;
}

function trySaveProducts(products) {
  try {
    saveProducts(products);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

function createProductId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function orderText(key, fallback) {
  return typeof t === "function" ? t(key) : fallback;
}

function orderGreeting() {
  return orderText("order.greeting", "Здравствуйте, Гульзат! Хочу оформить заказ 😊");
}

function orderKindLabel(isService) {
  return isService ? orderText("ui.service", "Услуга") : orderText("ui.product", "Товар");
}

function customerMessageLines(customer) {
  const name = String(customer?.name || "").trim();
  const phone = String(customer?.phone || "").trim();
  const lines = [];
  if (name) lines.push(`${orderText("order.name", "Имя:")} ${name}`);
  if (phone) lines.push(`${orderText("order.phone", "Телефон:")} ${formatPhone(phone)}`);
  return lines;
}

/** "2026-11-15" → "15.11.2026" */
function formatDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function wishesMessageLines(wishes) {
  const color = String(wishes?.color || "").trim();
  const dueDate = formatDueDate(wishes?.dueDate);
  const comment = String(wishes?.comment || "").trim();
  const lines = [];
  if (color) lines.push(`${orderText("order.color", "Цвет и пожелания:")} ${color}`);
  if (dueDate) lines.push(`${orderText("order.dueDate", "Нужно к дате:")} ${dueDate}`);
  if (comment) lines.push(`${orderText("order.comment", "Комментарий:")} ${comment}`);
  return lines;
}

function buildOrderMessage(product, quantity = 1, customer = null, wishes = null) {
  const qty = Math.min(99, Math.max(1, Number(quantity) || 1));
  const isService = normalizeItemType(product?.itemType) === "service";
  const kind = orderKindLabel(isService);
  const name = String(product?.name || "").trim() || kind;
  const unit = Number(product?.price) || 0;
  const lineTotal = unit * qty;
  const sumLabel = orderText("order.sum", "Сумма:");
  const priceLine =
    unit > 0
      ? `${sumLabel} ${formatPrice(lineTotal, product.currency)}`
      : isService
        ? `${sumLabel} ${orderText("order.servicePrice", "от 15 000 ₸ — по сложности заказа")}`
        : `${sumLabel} ${orderText("order.productPrice", "от 5 000 ₸ — индивидуальный заказ")}`;

  return [
    orderGreeting(),
    `${kind}: ${name}`,
    `${orderText("order.qty", "Количество:")} ${qty} ${orderText("order.pcs", "шт.")}`,
    priceLine,
    ...wishesMessageLines(wishes),
    ...customerMessageLines(customer),
  ].join("\n");
}

function buildCustomOrderMessage({ category, productName, itemType } = {}) {
  const kind = orderKindLabel(
    normalizeItemType(itemType) === "service" || String(productName || "").toLowerCase().includes("услуг")
  );
  const name = String(productName || "").trim();
  return name ? `${orderGreeting()}\n${kind}: ${name}` : `${orderGreeting()}\n${kind}`;
}

function orderWhatsAppUrl(product, quantity = 1, customer = null, wishes = null) {
  const text = encodeURIComponent(buildOrderMessage(product, quantity, customer, wishes));
  return `https://api.whatsapp.com/send?phone=${PHONE}&text=${text}`;
}

const CART_KEY = "gulzat_cart_v1";

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item.id || ""),
        qty: Math.min(99, Math.max(1, Number(item.qty) || 1)),
      }))
      .filter((item) => item.id);
  } catch {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function cartCount(items = loadCart()) {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

function addToCart(productId, quantity = 1) {
  const id = String(productId || "");
  if (!id) return loadCart();
  const max = maxOrderQtyById(id);
  if (max <= 0) return loadCart();
  const qty = Math.min(max, Math.max(1, Number(quantity) || 1));
  const cart = loadCart();
  const existing = cart.find((item) => item.id === id);
  if (existing) {
    existing.qty = Math.min(max, existing.qty + qty);
  } else {
    cart.push({ id, qty });
  }
  saveCart(cart);
  return cart;
}

function setCartQty(productId, quantity) {
  const id = String(productId || "");
  const qty = Math.min(maxOrderQtyById(id), Math.max(0, Number(quantity) || 0));
  let cart = loadCart().filter((item) => item.id !== id);
  if (qty > 0) cart.push({ id, qty });
  saveCart(cart);
  return cart;
}

function removeFromCart(productId) {
  const cart = loadCart().filter((item) => item.id !== String(productId || ""));
  saveCart(cart);
  return cart;
}

function clearCart() {
  saveCart([]);
  return [];
}

function getCartLines(cart = loadCart()) {
  const products = loadProducts();
  return cart
    .map((item) => {
      const product = products.find((p) => p.id === item.id);
      if (!product) return null;
      const qty = Math.min(item.qty, maxOrderQty(product));
      if (qty <= 0) return null;
      const unit = Number(product.price) || 0;
      return {
        product,
        qty,
        unit,
        lineTotal: unit * qty,
      };
    })
    .filter(Boolean);
}

function buildCartOrderMessage(cart = loadCart(), customer = null, wishes = null) {
  const lines = getCartLines(cart);
  if (!lines.length) {
    return [orderGreeting(), ...wishesMessageLines(wishes), ...customerMessageLines(customer)].join("\n");
  }

  const pcs = orderText("order.pcs", "шт.");
  const items = lines.map((line) => {
    const isService = normalizeItemType(line.product.itemType) === "service";
    const kind = orderKindLabel(isService);
    const name = String(line.product.name || "").trim() || kind;
    const pricePart =
      line.unit > 0
        ? formatPrice(line.lineTotal, line.product.currency)
        : isService
          ? orderText("price.fromService", "от 15 000 ₸")
          : orderText("price.fromProduct", "от 5 000 ₸");
    return `• ${kind}: ${name} — ${line.qty} ${pcs} — ${pricePart}`;
  });

  const byCurrency = {};
  lines.forEach((line) => {
    if (line.unit <= 0) return;
    const code = normalizeCurrency(line.product.currency);
    byCurrency[code] = (byCurrency[code] || 0) + line.lineTotal;
  });
  const totalText = Object.entries(byCurrency)
    .map(([code, sum]) => formatPrice(sum, code))
    .join(" · ");

  const parts = [orderGreeting(), ...items];
  if (totalText) {
    const hasOpenPrice = lines.some((line) => line.unit <= 0);
    const tail = hasOpenPrice ? ` ${orderText("order.plusOpen", "+ позиции по договорённости")}` : "";
    parts.push(`${orderText("order.total", "Итого:")} ${totalText}${tail}`);
  }
  parts.push(...wishesMessageLines(wishes));
  parts.push(...customerMessageLines(customer));
  return parts.join("\n");
}

function cartWhatsAppUrl(cart = loadCart(), customer = null, wishes = null) {
  const text = encodeURIComponent(buildCartOrderMessage(cart, customer, wishes));
  return `https://api.whatsapp.com/send?phone=${PHONE}&text=${text}`;
}

function customWhatsAppUrl(payload) {
  const text = encodeURIComponent(buildCustomOrderMessage(payload));
  return `https://api.whatsapp.com/send?phone=${PHONE}&text=${text}`;
}

const CUSTOMER_KEY = "gulzat_customer_v1";
const ORDERS_API = "/api/orders";

function loadCustomer() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "null");
    return {
      name: String(parsed?.name || ""),
      phone: String(parsed?.phone || ""),
    };
  } catch {
    return { name: "", phone: "" };
  }
}

function saveCustomer(customer) {
  try {
    localStorage.setItem(
      CUSTOMER_KEY,
      JSON.stringify({ name: String(customer?.name || ""), phone: String(customer?.phone || "") })
    );
  } catch {
    /* ignore */
  }
}

/** Возвращает номер в виде +77051234567 или "" если номер неполный */
function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length < 10 || digits.length > 15) return "";
  return `+${digits}`;
}

function formatPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return digits ? `+${digits}` : String(phone || "");
}

function orderItemFromProduct(product, quantity = 1) {
  return {
    productId: String(product?.id || ""),
    name: String(product?.name || "").trim(),
    itemType: normalizeItemType(product?.itemType),
    qty: Math.min(99, Math.max(1, Number(quantity) || 1)),
    price: Number(product?.price) || 0,
    currency: normalizeCurrency(product?.currency),
  };
}

function orderItemsFromCart(cart = loadCart()) {
  return getCartLines(cart).map((line) => orderItemFromProduct(line.product, line.qty));
}

const PENDING_ORDERS_KEY = "gulzat_pending_orders_v1";

function loadPendingOrders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_ORDERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function savePendingOrders(list) {
  try {
    if (list.length) localStorage.setItem(PENDING_ORDERS_KEY, JSON.stringify(list.slice(-20)));
    else localStorage.removeItem(PENDING_ORDERS_KEY);
  } catch {
    /* ignore */
  }
}

function queuePendingOrder(body) {
  const list = loadPendingOrders();
  if (!list.includes(body)) list.push(body);
  savePendingOrders(list);
}

/** true — сервер принял заказ или окончательно отклонил (4xx); false — стоит повторить позже */
function postOrder(body) {
  try {
    return fetch(ORDERS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
      .then((res) => res.ok || (res.status >= 400 && res.status < 500))
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

function sendOrderToCrm({ customer, channel, source, items, wishes }) {
  const body = JSON.stringify({
    name: String(customer?.name || "").trim(),
    phone: String(customer?.phone || "").trim(),
    channel,
    source,
    items,
    color: String(wishes?.color || "").trim(),
    dueDate: String(wishes?.dueDate || ""),
    comment: String(wishes?.comment || "").trim(),
    page: location.pathname,
    lang: typeof getLang === "function" ? getLang() : "ru",
  });
  return postOrder(body).then((delivered) => {
    if (!delivered) queuePendingOrder(body);
    return delivered;
  });
}

function flushPendingOrders() {
  const queue = loadPendingOrders();
  if (!queue.length) return;
  savePendingOrders([]);
  queue.forEach((body) => {
    postOrder(body).then((delivered) => {
      if (!delivered) queuePendingOrder(body);
    });
  });
}

function ensureSampleService() {
  if (typeof loadProducts !== "function" || typeof saveProducts !== "function") return;
  if (isSeedRemoved("service-sample-it")) return;
  const all = loadProducts();
  const index = all.findIndex((item) => item.id === "service-sample-it");
  const sample = {
    id: "service-sample-it",
    name: "IT-системы и CRM",
    price: 0,
    currency: "kzt",
    category: "it-systems",
    itemType: "service",
    description: "Поддержка, внедрение систем, боты, сайты для продаж и CRM.",
    image: "./images/service-it.png",
  };
  if (index === -1) {
    all.unshift(sample);
    trySaveProducts(all);
    return;
  }
  const current = all[index];
  all[index] = {
    ...sample,
    ...current,
    id: sample.id,
    itemType: "service",
    image: current.image || sample.image,
  };
  trySaveProducts(all);
}

function ensureReadyMadeProduct() {
  if (typeof loadProducts !== "function" || typeof saveProducts !== "function") return;
  if (isSeedRemoved("ready-made-sets")) return;
  const all = loadProducts();
  const index = all.findIndex((item) => item.id === "ready-made-sets");
  const ready = {
    id: "ready-made-sets",
    name: "Готовые изделия",
    price: 0,
    currency: "kzt",
    category: "wedding",
    itemType: "product",
    description: "Свадебные наборы, корзины, пуфы и другие изделия под ваш дизайн.",
    image: "./images/products-ready-LOCKED.png?v=1",
  };
  if (index === -1) {
    all.unshift(ready);
    trySaveProducts(all);
    return;
  }
  const current = all[index];
  all[index] = {
    ...ready,
    ...current,
    id: ready.id,
    itemType: "product",
    image: ready.image,
  };
  trySaveProducts(all);
}

function ensureCatalogProducts() {
  if (typeof loadProducts !== "function" || typeof saveProducts !== "function") return;
  ensureReadyMadeProduct();

  const samples = [
    {
      id: "product-baskets",
      name: "Национальные корзины",
      price: 8000,
      currency: "kzt",
      category: "baskets",
      itemType: "product",
      description: "Корзины ручной работы для подарков и торжеств.",
      image: "./images/product-baskets.png?v=2",
    },
    {
      id: "product-poufs",
      name: "Пуфы",
      price: 15000,
      currency: "kzt",
      category: "poufs",
      itemType: "product",
      description: "Мягкие пуфы с текстилем под ваш интерьер.",
      image: "./images/product-poufs.png?v=1",
    },
    {
      id: "product-photozone",
      name: "Фотозона",
      price: 50000,
      currency: "kzt",
      category: "wedding",
      itemType: "product",
      description: "Цветочная фотозона для свадеб и торжеств.",
      image: "./images/product-photozone.png?v=2",
    },
  ];

  let all = loadProducts().filter((item) => item.id !== "product-floral");
  samples.forEach((sample) => {
    if (isSeedRemoved(sample.id)) return;
    const index = all.findIndex((item) => item.id === sample.id);
    if (index === -1) {
      all.push(sample);
    } else {
      const current = all[index];
      all[index] = {
        ...sample,
        ...current,
        id: sample.id,
        itemType: "product",
        image: current.image || sample.image,
      };
    }
  });
  trySaveProducts(all);
}

function ensureCatalogServices() {
  if (typeof loadProducts !== "function" || typeof saveProducts !== "function") return;
  ensureSampleService();

  const samples = [
    {
      id: "service-sites",
      name: "Сайты",
      price: 0,
      currency: "kzt",
      category: "sites",
      itemType: "service",
      description: "Лендинги и сайты для продаж под ваш бренд.",
      image: "./images/card-it.png",
    },
    {
      id: "service-ai-video",
      name: "ИИ-ролики",
      price: 0,
      currency: "kzt",
      category: "ai-video",
      itemType: "service",
      description: "Короткие видеоролики с помощью нейросетей.",
      image: "./images/card-video.png",
    },
  ];

  const all = loadProducts();
  samples.forEach((sample) => {
    if (isSeedRemoved(sample.id)) return;
    const index = all.findIndex((item) => item.id === sample.id);
    if (index === -1) {
      all.push(sample);
    } else {
      const current = all[index];
      all[index] = {
        ...sample,
        ...current,
        id: sample.id,
        itemType: "service",
        image: current.image || sample.image,
      };
    }
  });
  trySaveProducts(all);
}
