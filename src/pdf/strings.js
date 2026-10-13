const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

export const strings = {
  brand: "Gulzat",
  catalogProducts: "Каталог товаров",
  catalogServices: "Каталог услуг",
  catalogAll: "Каталог",
  watch: "Смотреть",
};

export function coverTitle(scope) {
  if (scope === "services") return strings.catalogServices;
  if (scope === "all") return strings.catalogAll;
  return strings.catalogProducts;
}

export function formatCatalogDate(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function pageLabel(page, total) {
  return `стр. ${page} из ${total}`;
}

export function footerLabel(phone) {
  return `${strings.brand} · ${phone}`;
}

export function clipText(text, max = 250) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}…`;
}
