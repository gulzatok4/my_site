import { describe, expect, it } from "vitest";
import { isSiteHref, linkParts } from "./format.js";

describe("ссылки в ответе чата", () => {
  it("оставляет кликабельными только WhatsApp и телефон сайта", () => {
    const parts = linkParts("Пишите https://wa.me/77051406940 или 8 705 140 69 40");
    const links = parts.filter((part) => typeof part !== "string");
    expect(links.map((part) => part.href)).toEqual(["https://wa.me/77051406940", "tel:+77051406940"]);
    expect(links.every((part) => isSiteHref(part.href))).toBe(true);
  });

  it("чужой адрес и чужой телефон показывает текстом", () => {
    const parts = linkParts("Смотрите https://evil.example/pay и +7 777 000 00 00");
    expect(parts.every((part) => typeof part === "string")).toBe(true);
    expect(parts.join("")).toContain("https://evil.example/pay");
    expect(parts.join("")).toContain("+7 777 000 00 00");
  });
});
