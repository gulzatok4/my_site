import { getLang, t } from "./i18n.js";

const storeListeners = new Set();

export function subscribeStore(listener) {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

let emitScheduled = false;

function emitStore() {
  if (emitScheduled) return;
  emitScheduled = true;
  queueMicrotask(() => {
    emitScheduled = false;
    storeListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error(error);
      }
    });
  });
}

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
  markLocalChange();
  emitStore();
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
  markLocalChange();
  emitStore();
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
  markLocalChange();
  emitStore();
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
  ensureCatalogNow(true);
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

/** Все категории типа, включая скрытые. Витрина по-прежнему берёт categoriesForType. */
function categoryChoices(itemType) {
  const type = normalizeItemType(itemType);
  const hidden = new Set(loadHiddenCategories());
  const base = type === "service" ? SERVICE_CATEGORIES : PRODUCT_CATEGORIES;
  const custom = loadCustomCategories().filter((item) => item.itemType === type);
  const seen = new Set();
  const list = [];
  for (const item of [...base, ...custom]) {
    const code = String(item.code || "").trim().toLowerCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    list.push({ code, label: String(item.label || code), itemType: type, hidden: hidden.has(code) });
  }
  return list;
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
  if (!list.length) return key;
  if (list.some((item) => item.code === key)) return key;
  return list[0].code;
}

function categoryLabel(code, itemType = "product") {
  const key = String(code || "").toLowerCase();
  const found = allCategories().find((item) => item.code === key);
  if (found) return found.label;
  const list = categoriesForType(itemType);
  return list[0]?.label || key;
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
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const itemType = normalizeItemType(item.itemType);
        return {
          ...item,
          currency: normalizeCurrency(item.currency),
          itemType,
          category: normalizeCategory(item.category, itemType),
          link: String(item.link || "").trim(),
        };
      });
  } catch {
    return [];
  }
}

function saveProducts(products) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  markLocalChange();
  emitStore();
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
const CATALOG_BASE_KEY = "gulzat_catalog_base_v1";
const CATALOG_PENDING_KEY = "gulzat_catalog_pending_v1";
let catalogPushEnabled = false;
let catalogPushListener = null;
let catalogPushTimer = 0;
let syncSeq = 0;
let hydrated = false;
let catalogReady = false;
let pendingLocal = false;
let pushQueued = false;
let pushInFlight = false;
let pushAgain = false;
let memoryBase = null;
let latestRevision = 0;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Флаг лежит в localStorage: неотправленные правки переживают перезагрузку и видны другим вкладкам */
function hasPendingChanges() {
  try {
    return localStorage.getItem(CATALOG_PENDING_KEY) === "1" || pendingLocal;
  } catch {
    return pendingLocal;
  }
}

function setPending(value) {
  pendingLocal = value;
  try {
    if (value) localStorage.setItem(CATALOG_PENDING_KEY, "1");
    else localStorage.removeItem(CATALOG_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function markLocalChange() {
  setPending(true);
  scheduleCatalogPush();
}

function writeProductsIfChanged(products, { publish = false } = {}) {
  if (stableJson(loadProducts()) === stableJson(products)) return false;
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  } catch (error) {
    console.error(error);
    return false;
  }
  if (publish) markLocalChange();
  emitStore();
  return true;
}

const EMPTY_CATALOG = { products: [], categories: [], hiddenCategories: [], removedSeeds: [], revision: 0 };
/** Те же лимиты, что в serve.ps1: при переполнении отбрасывается новое добавление, а не существующие позиции */
const CATALOG_PRODUCT_LIMIT = 5000;
const CATALOG_CATEGORY_LIMIT = 200;

function storedList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function catalogShape(catalog) {
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    products: list(catalog?.products).filter((item) => item && typeof item === "object" && String(item.id || "")),
    categories: list(catalog?.categories).filter((item) => item && typeof item === "object" && String(item.code || "")),
    hiddenCategories: list(catalog?.hiddenCategories).map(String),
    removedSeeds: list(catalog?.removedSeeds).map(String),
    revision: Number(catalog?.revision) || 0,
  };
}

/** Каталог в браузере как есть, без нормализации loadProducts: иначе в разницу попадут поля, которые никто не менял */
function localCatalog() {
  return catalogShape({
    products: storedList(PRODUCTS_KEY),
    categories: storedList(CATEGORIES_KEY),
    hiddenCategories: storedList(HIDDEN_CATEGORIES_KEY),
    removedSeeds: storedList(REMOVED_SEEDS_KEY),
  });
}

/** Последняя версия каталога с сервера: относительно неё считается, что поменяли в этом браузере */
function loadBase() {
  if (memoryBase) return memoryBase;
  try {
    const parsed = JSON.parse(localStorage.getItem(CATALOG_BASE_KEY) || "null");
    return parsed && Array.isArray(parsed.products) ? catalogShape(parsed) : null;
  } catch {
    return null;
  }
}

function saveBase(catalog) {
  try {
    localStorage.setItem(CATALOG_BASE_KEY, JSON.stringify(catalog));
    memoryBase = null;
  } catch {
    memoryBase = catalog;
  }
}

function diffStringSet(base, local) {
  const before = new Set(base);
  const after = new Set(local);
  return { add: local.filter((item) => !before.has(item)), remove: base.filter((item) => !after.has(item)) };
}

/** Что поменяли в браузере относительно base. Формат разбирает Merge-CatalogPatch в serve.ps1 */
function diffCatalog(base, local) {
  const baseProducts = new Map(base.products.map((item) => [String(item.id), item]));
  const localIds = new Set(local.products.map((item) => String(item.id)));
  const products = { add: [], update: [], remove: [] };
  let after = "";
  local.products.forEach((product) => {
    const id = String(product.id);
    const old = baseProducts.get(id);
    if (!old) {
      products.add.push({ after, product });
    } else {
      const set = {};
      Object.keys(product).forEach((key) => {
        if (key !== "id" && stableJson(product[key]) !== stableJson(old[key])) set[key] = product[key];
      });
      const unset = Object.keys(old).filter((key) => key !== "id" && !(key in product));
      if (Object.keys(set).length || unset.length) products.update.push({ id, set, unset });
    }
    after = id;
  });
  base.products.forEach((item) => {
    if (!localIds.has(String(item.id))) products.remove.push(String(item.id));
  });

  const baseCategories = new Map(base.categories.map((item) => [String(item.code), item]));
  const localCodes = new Set(local.categories.map((item) => String(item.code)));
  const categories = {
    upsert: local.categories.filter((item) => {
      const old = baseCategories.get(String(item.code));
      return !old || stableJson(old) !== stableJson(item);
    }),
    remove: base.categories.map((item) => String(item.code)).filter((code) => !localCodes.has(code)),
  };

  return {
    products,
    categories,
    hiddenCategories: diffStringSet(base.hiddenCategories, local.hiddenCategories),
    removedSeeds: diffStringSet(base.removedSeeds, local.removedSeeds),
  };
}

function isEmptyPatch(patch) {
  return [
    patch.products.add,
    patch.products.update,
    patch.products.remove,
    patch.categories.upsert,
    patch.categories.remove,
    patch.hiddenCategories.add,
    patch.hiddenCategories.remove,
    patch.removedSeeds.add,
    patch.removedSeeds.remove,
  ].every((list) => !list.length);
}

function applyStringSet(current, change) {
  const next = [];
  current.forEach((item) => {
    const value = String(item).trim();
    if (value && !next.includes(value)) next.push(value);
  });
  const removed = new Set(change.remove.map((item) => String(item).trim()));
  const kept = next.filter((item) => !removed.has(item));
  change.add.forEach((item) => {
    const value = String(item).trim();
    if (value && !kept.includes(value)) kept.push(value);
  });
  return kept;
}

/** Накладывает изменения так же, как Merge-CatalogPatch в serve.ps1 — менять их нужно вместе */
function applyCatalogPatch(catalog, patch) {
  const products = catalog.products.map((item) => ({ ...item }));
  const indexOf = (id) => products.findIndex((item) => String(item.id) === id);
  patch.products.remove.forEach((id) => {
    const index = indexOf(id);
    if (index >= 0) products.splice(index, 1);
  });
  patch.products.update.forEach(({ id, set, unset }) => {
    const index = indexOf(id);
    if (index < 0) return;
    const next = { ...products[index], ...set, id: products[index].id };
    unset.forEach((key) => {
      if (key !== "id") delete next[key];
    });
    products[index] = next;
  });
  patch.products.add.forEach(({ after, product }) => {
    const existing = indexOf(String(product.id));
    if (existing >= 0) {
      products[existing] = { ...product };
      return;
    }
    if (products.length >= CATALOG_PRODUCT_LIMIT) return;
    products.splice((after ? indexOf(after) : -1) + 1, 0, { ...product });
  });

  const categories = catalog.categories.filter((item) => !patch.categories.remove.includes(String(item.code)));
  patch.categories.upsert.forEach((category) => {
    const index = categories.findIndex((item) => String(item.code) === String(category.code));
    if (index >= 0) categories[index] = category;
    else if (categories.length < CATALOG_CATEGORY_LIMIT) categories.push(category);
  });

  return {
    products,
    categories,
    hiddenCategories: applyStringSet(catalog.hiddenCategories, patch.hiddenCategories),
    removedSeeds: applyStringSet(catalog.removedSeeds, patch.removedSeeds),
    revision: catalog.revision,
  };
}

/** Свежие данные сервера плюс правки этого браузера, которые до сервера ещё не дошли */
function rebaseLocalOnto(server) {
  const patch = diffCatalog(loadBase() || EMPTY_CATALOG, localCatalog());
  saveBase(server);
  applyServerCatalog(applyCatalogPatch(server, patch));
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

function publishEnsuredCatalog() {
  return ensureCatalogNow(catalogPushEnabled);
}

function settleHydration(result) {
  if (!hydrated) {
    if (!result?.ok) ensureCatalogNow(false);
    else if (result.empty) publishEnsuredCatalog();
    hydrated = true;
    pruneCart();
    catalogReady = true;
    if (hasPendingChanges()) scheduleCatalogPush();
    emitStore();
    return;
  }
  pruneCart();
}

/** { ok, empty, merged, stale }; ok=false — сервер недоступен, работаем с копией в браузере */
function syncCatalogFromServer({ mergeLocalOnce = false } = {}) {
  if (location.protocol === "file:") return Promise.resolve({ ok: false });
  const seq = ++syncSeq;
  let result = { ok: false };
  return fetch(CATALOG_API, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`http_${res.status}`))))
    .then((data) => {
      if (seq !== syncSeq) return { ok: false, stale: true };
      if (!data || !("catalog" in data)) throw new Error("bad_response");
      const firstSync = mergeLocalOnce && !localStorage.getItem(CATALOG_SYNCED_KEY);
      if (mergeLocalOnce) localStorage.setItem(CATALOG_SYNCED_KEY, "1");
      if (!data.catalog || !Array.isArray(data.catalog.products)) return { ok: true, empty: true, merged: false };
      const server = catalogShape(data.catalog);
      if (server.revision < latestRevision) return { ok: true, stale: true, empty: false, merged: false };
      latestRevision = server.revision;

      const before = catalogStorageJson();
      let merged = false;
      if (hasPendingChanges()) {
        rebaseLocalOnto(server);
        scheduleCatalogPush();
      } else {
        saveBase(server);
        let next = server;
        if (firstSync) ({ catalog: next, merged } = mergeLocalIntoCatalog(server));
        applyServerCatalog(next);
        if (merged && catalogPushEnabled) markLocalChange();
      }
      publishEnsuredCatalog();
      if (catalogStorageJson() !== before) emitStore();
      return { ok: true, empty: false, merged };
    })
    .catch(() => ({ ok: false, stale: seq !== syncSeq }))
    .then((value) => {
      result = value;
      return value;
    })
    .finally(() => {
      if (seq !== syncSeq) return;
      settleHydration(result);
    });
}

/**
 * Отправляет только разницу с последней версией сервера, а не весь каталог:
 * остатки, списанные заказами, и правки с другого устройства не затираются.
 * "ok" | "unauthorized" | "error" | "offline" | "unchanged"
 */
function pushCatalogToServer() {
  const sent = localCatalog();
  const patch = diffCatalog(loadBase() || EMPTY_CATALOG, sent);
  if (isEmptyPatch(patch)) {
    setPending(false);
    return Promise.resolve("unchanged");
  }
  const headers = { "Content-Type": "application/json" };
  let key = "";
  try {
    key = sessionStorage.getItem("gulzat_admin_key") || "";
  } catch {
    /* ignore */
  }
  if (key) headers["X-Admin-Key"] = encodeURIComponent(key);
  pushInFlight = true;
  return fetch(CATALOG_API, { method: "PATCH", headers, body: JSON.stringify({ patch }), cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return res.status === 401 || res.status === 429 ? "unauthorized" : "error";
      const data = await res.json().catch(() => null);
      if (!data?.catalog || !Array.isArray(data.catalog.products)) return "error";
      const server = catalogShape(data.catalog);
      latestRevision = Math.max(latestRevision, server.revision);
      const later = diffCatalog(sent, localCatalog());
      const before = catalogStorageJson();
      saveBase(server);
      applyServerCatalog(applyCatalogPatch(server, later));
      if (isEmptyPatch(later)) setPending(false);
      else pushAgain = true;
      if (catalogStorageJson() !== before) emitStore();
      return "ok";
    })
    .catch(() => "offline")
    .finally(() => {
      pushInFlight = false;
      if (pushAgain) {
        pushAgain = false;
        scheduleCatalogPush();
      }
    });
}

function scheduleCatalogPush() {
  if (!catalogPushEnabled) {
    if (hasPendingChanges()) pushQueued = true;
    return;
  }
  if (!catalogReady) {
    pushQueued = true;
    return;
  }
  pushQueued = false;
  clearTimeout(catalogPushTimer);
  catalogPushTimer = setTimeout(() => {
    if (pushInFlight) {
      pushAgain = true;
      return;
    }
    pushCatalogToServer().then((status) => catalogPushListener?.(status));
  }, 300);
}

/** Только для админки: изменения каталога отправляются на сервер */
function enableCatalogPush(listener) {
  catalogPushEnabled = true;
  catalogPushListener = typeof listener === "function" ? listener : null;
  if (catalogReady && hasPendingChanges()) scheduleCatalogPush();
}

function disableCatalogPush() {
  catalogPushEnabled = false;
  catalogPushListener = null;
  clearTimeout(catalogPushTimer);
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
const CART_WISHES_KEY = "gulzat_cart_wishes_v1";

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
  if (!items.length) localStorage.removeItem(CART_WISHES_KEY);
  emitStore();
}

/** Цвет, дата и комментарий, собранные чатом, — подставляются в форму оформления корзины */
function loadCartWishes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_WISHES_KEY) || "null");
    return {
      color: String(parsed?.color || ""),
      dueDate: String(parsed?.dueDate || ""),
      comment: String(parsed?.comment || ""),
    };
  } catch {
    return { color: "", dueDate: "", comment: "" };
  }
}

function saveCartWishes(wishes) {
  const next = { ...loadCartWishes() };
  ["color", "dueDate", "comment"].forEach((key) => {
    const value = String(wishes?.[key] || "").trim();
    if (value) next[key] = value;
  });
  try {
    localStorage.setItem(CART_WISHES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
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

function pruneCart() {
  const cart = loadCart();
  const next = getCartLines(cart).map((line) => ({ id: line.product.id, qty: line.qty }));
  const same =
    cart.length === next.length && cart.every((item, index) => item.id === next[index].id && item.qty === next[index].qty);
  if (!same) saveCart(next);
  return next;
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
  const cap = maxOrderQty(product);
  if (cap <= 0) return null;
  return {
    productId: String(product?.id || ""),
    name: String(product?.name || "").trim(),
    itemType: normalizeItemType(product?.itemType),
    qty: Math.min(cap, Math.max(1, Number(quantity) || 1)),
    price: Number(product?.price) || 0,
    currency: normalizeCurrency(product?.currency),
  };
}

function orderItemsFromCart(cart = loadCart()) {
  return getCartLines(cart)
    .map((line) => orderItemFromProduct(line.product, line.qty))
    .filter(Boolean);
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

function removePendingOrder(body) {
  savePendingOrders(loadPendingOrders().filter((item) => item !== body));
}

/**
 * "ok" — принят; "out_of_stock" / "price_changed" — каталог у покупателя устарел;
 * "rejected" — ошибка данных, повтор бессмыслен; "retry" — сеть или 5xx
 */
function postOrder(body) {
  try {
    return fetch(ORDERS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
      .then(async (res) => {
        if (res.ok) return "ok";
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          if (data.error === "out_of_stock" || data.error === "price_changed") return data.error;
        }
        if (res.status >= 400 && res.status < 500) return "rejected";
        return "retry";
      })
      .catch(() => "retry");
  } catch {
    return Promise.resolve("retry");
  }
}

function createClientId() {
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * strictPrice: покупатель ещё в форме, поэтому при смене цены или нехватке остатка сервер отказывает,
 * и покупатель видит актуальные данные. В очередь заказ попадает без этого флага: покупатель уже
 * ушёл в WhatsApp, и сервер должен сохранить заказ в любом случае
 */
function sendOrderToCrm({ customer, channel, source, items, wishes, clientId }) {
  const payload = {
    clientId: String(clientId || createClientId()),
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
  };
  return postOrder(JSON.stringify({ ...payload, strictPrice: true })).then((status) => {
    if (status === "retry") queuePendingOrder(JSON.stringify(payload));
    if (status === "out_of_stock" || status === "price_changed") {
      return syncCatalogFromServer().then(
        () => status,
        () => status
      );
    }
    return status;
  });
}

let flushingOrders = false;

/** Заказ убирается из очереди только после ответа сервера: закрытая посреди отправки вкладка его не теряет */
function flushPendingOrders() {
  if (flushingOrders) return;
  const queue = loadPendingOrders();
  if (!queue.length) return;
  flushingOrders = true;
  Promise.all(
    queue.map((body) =>
      postOrder(body).then((status) => {
        if (status !== "retry") removePendingOrder(body);
      })
    )
  ).finally(() => {
    flushingOrders = false;
  });
}

function ensureSampleService(publish) {
  if (isSeedRemoved("service-sample-it")) return false;
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
    return writeProductsIfChanged(all, { publish });
  }
  const current = all[index];
  all[index] = {
    ...sample,
    ...current,
    id: sample.id,
    itemType: "service",
    image: current.image || sample.image,
  };
  return writeProductsIfChanged(all, { publish });
}

function ensureReadyMadeProduct(publish) {
  if (isSeedRemoved("ready-made-sets")) return false;
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
    return writeProductsIfChanged(all, { publish });
  }
  const current = all[index];
  all[index] = {
    ...ready,
    ...current,
    id: ready.id,
    itemType: "product",
    image: ready.image,
  };
  return writeProductsIfChanged(all, { publish });
}

function ensureCatalogProductsBody(publish) {
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
  return writeProductsIfChanged(all, { publish });
}

function ensureCatalogServicesBody(publish) {
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
  return writeProductsIfChanged(all, { publish });
}

function ensureCatalogNow(publish) {
  const ready = ensureReadyMadeProduct(publish);
  const products = ensureCatalogProductsBody(publish);
  const sample = ensureSampleService(publish);
  const services = ensureCatalogServicesBody(publish);
  return Boolean(ready || products || sample || services);
}

function ensureCatalogProducts() {
  if (!hydrated) return;
  ensureReadyMadeProduct(true);
  ensureCatalogProductsBody(true);
}

function ensureCatalogServices() {
  if (!hydrated) return;
  ensureSampleService(true);
  ensureCatalogServicesBody(true);
}

export {
  PHONE,
  CURRENCIES,
  PRODUCT_CATEGORIES,
  SERVICE_CATEGORIES,
  ITEM_TYPES,
  categoriesForType,
  categoryChoices,
  allCategories,
  addCustomCategory,
  removeCategory,
  normalizeCurrency,
  normalizeCategory,
  categoryLabel,
  normalizeItemType,
  itemTypeLabel,
  formatPrice,
  loadProducts,
  saveProducts,
  trySaveProducts,
  productStock,
  maxOrderQty,
  createProductId,
  loadCart,
  addToCart,
  setCartQty,
  loadCartWishes,
  saveCartWishes,
  removeFromCart,
  clearCart,
  cartCount,
  pruneCart,
  getCartLines,
  orderWhatsAppUrl,
  cartWhatsAppUrl,
  loadCustomer,
  saveCustomer,
  normalizePhone,
  formatPhone,
  orderItemFromProduct,
  orderItemsFromCart,
  sendOrderToCrm,
  flushPendingOrders,
  ensureCatalogProducts,
  ensureCatalogServices,
  restoreDefaultCatalog,
  markSeedRemoved,
  syncCatalogFromServer,
  enableCatalogPush,
  disableCatalogPush,
  scheduleCatalogPush,
  formatDueDate,
};
