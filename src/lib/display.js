import {
  formatPrice,
  normalizeCurrency,
  normalizeItemType,
  productStock,
} from "./catalog.js";
import { getLang, t } from "./i18n.js";

export function priceLabel(product) {
  const isService = normalizeItemType(product.itemType) === "service";
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) {
    return isService ? t("feat.service.price") : t("feat.product.price");
  }
  return formatPrice(product.price, product.currency);
}

export function cartLinePrice(line) {
  if (line.unit > 0) return formatPrice(line.lineTotal, line.product.currency);
  return normalizeItemType(line.product.itemType) === "service"
    ? t("price.fromService")
    : t("price.fromProduct");
}

export function stockLabel(product) {
  const stock = productStock(product);
  if (stock === null) return "";
  if (stock === 0) return t("ui.outOfStock");
  return t("ui.inStock").replace("{n}", String(stock));
}

export function catalogLead(scope, count) {
  if (!count) return t(`catalog.${scope}.empty`);
  const forms = t(`catalog.${scope}.forms`).split("|");
  const lang = getLang();
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
  return t(`catalog.${scope}.count`).replace("{n}", String(count)).replace("{word}", word);
}

export function sortBySeeds(items, seedOrder) {
  return [...items].sort((a, b) => {
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
}

export function cartTotalView(lines) {
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
  const note = !totalText ? t("cart.allOpen") : hasOpenPrice ? t("cart.plusOpen") : "";
  return {
    total: totalText ? `${t("cart.total")} ${totalText}` : "",
    note,
  };
}

export function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function langTitle() {
  const label = t(`lang.${getLang()}`);
  return {
    text: label,
    title: `${t("lang.kk")} / ${t("lang.ru")} / ${t("lang.en")}`,
  };
}
