import { describe, expect, it } from "vitest";
import { resolveStockSave } from "./catalog.js";

describe("остаток при сохранении товара", () => {
  it("не затирает склад, если поле остатка не меняли", () => {
    expect(
      resolveStockSave({ itemType: "product", stockTouched: false, formStock: "10", currentStock: 8 })
    ).toEqual({ ok: true, stock: 8 });
    expect(
      resolveStockSave({ itemType: "product", stockTouched: false, formStock: "10", currentStock: 0 })
    ).toEqual({ ok: true, stock: 0 });
    expect(
      resolveStockSave({ itemType: "product", stockTouched: false, formStock: "10", currentStock: null })
    ).toEqual({ ok: true, stock: null });
  });

  it("записывает число, которое ввели в поле", () => {
    expect(
      resolveStockSave({ itemType: "product", stockTouched: true, formStock: "12", currentStock: 8 })
    ).toEqual({ ok: true, stock: 12 });
    expect(
      resolveStockSave({ itemType: "product", stockTouched: true, formStock: "", currentStock: 8 })
    ).toEqual({ ok: true, stock: null });
    expect(
      resolveStockSave({ itemType: "product", stockTouched: true, formStock: "10000", currentStock: 1 })
    ).toEqual({ ok: true, stock: 9999 });
  });

  it("услуга остаток не ведёт", () => {
    expect(
      resolveStockSave({ itemType: "service", stockTouched: true, formStock: "5", currentStock: 5 })
    ).toEqual({ ok: true, stock: null });
  });

  it("не принимает отрицательный остаток", () => {
    expect(resolveStockSave({ itemType: "product", stockTouched: true, formStock: "-1", currentStock: 4 }).ok).toBe(
      false
    );
  });
});
