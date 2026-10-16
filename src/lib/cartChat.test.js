import { beforeEach, describe, expect, it } from "vitest";
import { applyAssistantCart, loadCart, loadCartWishes } from "./catalog.js";

function installStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

describe("корзина из чата", () => {
  beforeEach(() => {
    installStorage();
    localStorage.setItem(
      "gulzat_products_v2",
      JSON.stringify([
        { id: "p1", name: "Қалта", itemType: "product", price: 8000, currency: "kzt", stock: 5, category: "baskets" },
        { id: "p2", name: "Пуф", itemType: "product", price: 12000, currency: "kzt", stock: 0, category: "poufs" },
      ]),
    );
  });

  it("прибавляет количество и копит цвет с датами", () => {
    applyAssistantCart([{ id: "p1", qty: 1, color: "бордо", dueDate: "2026-12-01" }]);
    applyAssistantCart([{ id: "p1", qty: 1, color: "золото", dueDate: "2026-11-20", comment: "той" }]);
    expect(loadCart()).toEqual([{ id: "p1", qty: 2 }]);
    const wishes = loadCartWishes();
    expect(wishes.color).toContain("бордо");
    expect(wishes.color).toContain("золото");
    expect(wishes.dueDate).toBe("2026-11-20");
    expect(wishes.comment).toContain("2026-12-01");
    expect(wishes.comment).toContain("той");
  });

  it("заменяет количество только по явной просьбе", () => {
    applyAssistantCart([{ id: "p1", qty: 3 }]);
    applyAssistantCart([{ id: "p1", qty: 1, replace: true }]);
    expect(loadCart()).toEqual([{ id: "p1", qty: 1 }]);
  });

  it("не молчит, если позицию нельзя положить", () => {
    const missing = applyAssistantCart([{ id: "gone", name: "Сундук", qty: 1 }]);
    const stock = applyAssistantCart([{ id: "p2", qty: 1 }]);
    expect(missing.skipped).toEqual(["Сундук"]);
    expect(stock.skipped).toEqual(["Пуф"]);
    expect(loadCart()).toEqual([]);
  });
});
