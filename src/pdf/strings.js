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

export const invoiceStrings = {
  title: "Счёт на оплату",
  beneficiary: "Бенефициар",
  bin: "БИН/ИИН",
  iik: "ИИК",
  kbe: "КБе",
  bank: "Банк бенефициара",
  bik: "БИК",
  knp: "КНП",
  supplier: "Поставщик",
  buyer: "Покупатель",
  colNo: "№",
  colName: "Наименование",
  colQty: "Кол-во",
  colUnit: "Ед.",
  colPrice: "Цена",
  colSum: "Сумма",
  unitProduct: "шт.",
  unitService: "усл.",
  total: "Итого",
  vatIncluded: "В том числе НДС",
  noVat: "Без НДС",
  grand: "Всего к оплате",
  itemsOnSum: "Всего наименований",
  onSum: "на сумму",
  signatory: "Руководитель",
  defaultNote: "Заказ запускается в работу после 100% предоплаты. Способ оплаты согласуем в WhatsApp.",
};

export function coverTitle(scope) {
  if (scope === "services") return strings.catalogServices;
  if (scope === "all") return strings.catalogAll;
  return strings.catalogProducts;
}

export function formatCatalogDate(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatInvoiceDate(createdAt) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(createdAt || ""));
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return `${Number(match[3])} ${month} ${match[1]} г.`;
}

export function invoiceHeading(number, createdAt) {
  return `${invoiceStrings.title} № ${number} от ${formatInvoiceDate(createdAt)}`;
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
