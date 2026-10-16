import { describe, expect, it } from "vitest";
import { fallbackReply, replyFor } from "./fallback.js";

describe("запасные ответы", () => {
  it("на слово «заказ» сначала собирает детали и не даёт WhatsApp", () => {
    const reply = replyFor("хочу заказать");
    expect(reply).toContain("цвет");
    expect(reply).not.toContain("wa.me");
  });

  it("контакты по-прежнему ведут на WhatsApp сайта", () => {
    expect(replyFor("как связаться")).toContain("https://wa.me/77051406940");
  });

  it("цену берёт из переданного каталога", () => {
    const reply = replyFor("сколько стоит", [
      { name: "Қалта", itemType: "product", price: "8 000 ₸" },
      { name: "Сайт", itemType: "service", price: "40 000 ₸" },
    ]);
    expect(reply).toContain("Қалта — 8 000 ₸");
    expect(reply).toContain("Сайт — 40 000 ₸");
    expect(reply).not.toContain("wa.me");
  });

  it("фото просит уточнить заказ, а не открывать мессенджер", () => {
    expect(fallbackReply("", [{ kind: "image" }])).not.toContain("wa.me");
  });
});
