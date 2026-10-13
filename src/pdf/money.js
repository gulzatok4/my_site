export function unitTiyn(price) {
  const value = Number(price);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function lineAmountTiyn(price, qty) {
  const count = Math.round(Number(qty));
  if (!Number.isFinite(count) || count <= 0) return 0;
  return unitTiyn(price) * count;
}

export function vatFromGross(totalTiyn, ratePercent) {
  const total = Math.round(Number(totalTiyn) || 0);
  const rate = Number(ratePercent);
  if (!Number.isFinite(rate) || rate <= 0 || !total) return 0;
  return Math.round((total * rate) / (100 + rate));
}

export function formatMoney(tiyn, currency, { code = false } = {}) {
  const value = Math.round(Number(tiyn) || 0);
  const negative = value < 0;
  const abs = Math.abs(value);
  const major = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const minor = String(abs % 100).padStart(2, "0");
  const amount = `${negative ? "-" : ""}${major},${minor}`;
  const key = String(currency || "kzt").toLowerCase();
  if (code) return `${amount} ${(key === "rub" ? "RUB" : key === "usd" ? "USD" : "KZT")}`;
  if (key === "usd") return `${negative ? "-" : ""}$${major},${minor}`;
  const symbol = key === "rub" ? "₽" : "₸";
  return `${amount} ${symbol}`;
}

export function summarizeInvoice(lines, options = {}) {
  const list = Array.isArray(lines) ? lines : [];
  const currencies = [...new Set(list.map((line) => String(line?.currency || "kzt").toLowerCase()))];
  if (currencies.length > 1) return { ok: false, reason: "mixed" };
  if (list.some((line) => !(Number(line?.price) > 0))) return { ok: false, reason: "zero" };
  const items = list.map((line) => {
    const qty = Math.round(Number(line.qty) || 0);
    const priceTiyn = unitTiyn(line.price);
    return { qty, priceTiyn, amountTiyn: lineAmountTiyn(line.price, qty) };
  });
  const totalTiyn = items.reduce((sum, item) => sum + item.amountTiyn, 0);
  const vatPayer = Boolean(options.vatPayer);
  const vatRate = vatPayer ? Number(options.vatRate) : 0;
  const vatTiyn = vatPayer && vatRate > 0 ? vatFromGross(totalTiyn, vatRate) : 0;
  return {
    ok: true,
    currency: currencies[0] || "kzt",
    items,
    totalTiyn,
    vatTiyn,
    vatPayer,
    vatRate: vatPayer ? vatRate : 0,
  };
}
