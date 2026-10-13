import { describe, expect, it } from "vitest";
import { formatMoney, lineAmountTiyn, summarizeInvoice, vatFromGross } from "./money.js";

describe("итоги счёта", () => {
  it("умножает цену на количество в тиынах", () => {
    expect(lineAmountTiyn(15000, 2)).toBe(3000000);
    expect(lineAmountTiyn(19.99, 3)).toBe(5997);
  });

  it("считает несколько позиций без НДС", () => {
    const summary = summarizeInvoice(
      [
        { price: 15000, qty: 2, currency: "kzt" },
        { price: 5000, qty: 1, currency: "kzt" },
      ],
      { vatPayer: false, vatRate: 12 }
    );
    expect(summary.ok).toBe(true);
    expect(summary.totalTiyn).toBe(3500000);
    expect(summary.vatTiyn).toBe(0);
    expect(formatMoney(summary.totalTiyn, "kzt", { code: true })).toBe("35 000,00 KZT");
  });

  it("выделяет НДС из суммы и округляет до тиына", () => {
    expect(vatFromGross(100, 16)).toBe(14);
    const summary = summarizeInvoice([{ price: 112, qty: 1, currency: "kzt" }], { vatPayer: true, vatRate: 12 });
    expect(summary.vatTiyn).toBe(1200);
    expect(summary.totalTiyn).toBe(11200);
  });

  it("не складывает разные валюты и не принимает цену 0", () => {
    expect(summarizeInvoice([{ price: 10, qty: 1, currency: "kzt" }, { price: 5, qty: 1, currency: "rub" }]).reason).toBe(
      "mixed"
    );
    expect(summarizeInvoice([{ price: 0, qty: 2, currency: "kzt" }]).reason).toBe("zero");
    expect(summarizeInvoice([{ price: 10, qty: 1, currency: "kzt" }, { price: 0, qty: 1, currency: "kzt" }]).reason).toBe(
      "zero"
    );
  });
});
