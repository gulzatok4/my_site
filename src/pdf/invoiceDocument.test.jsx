import { inflateSync } from "node:zlib";
import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { InvoiceDocument } from "./InvoiceDocument.jsx";
import { registerPdfFonts } from "./fonts.js";
import { summarizeInvoice } from "./money.js";

const seller = {
  name: "ИП Гульзат",
  bin: "123456789012",
  address: "Алматы, Әуезов",
  bank: "Kaspi Bank",
  iik: "KZ123456789012345678",
  bik: "CASPKZKA",
  kbe: "19",
  knp: "710",
  signatory: "Гульзат Н.",
  vatPayer: false,
  vatRate: null,
  note: "",
};

function pdfPlain(buffer) {
  const raw = buffer.toString("latin1");
  const parts = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const body = Buffer.from(match[1], "latin1");
    try {
      parts.push(inflateSync(body).toString("latin1"));
    } catch {
      parts.push(match[1]);
    }
  }
  return parts.join("\n").toLowerCase();
}

function hasGlyphs(plain, text) {
  return [...text].every((char) => plain.includes(char.codePointAt(0).toString(16).padStart(4, "0")));
}

describe("InvoiceDocument", () => {
  it("вшивает в PDF название, дату, №, тенге и казахскую букву", async () => {
    registerPdfFonts();
    const lines = [
      { name: "Готовые изделия", itemType: "product", qty: 1, price: 65000, currency: "kzt" },
      { name: "Набор для сырға салу", itemType: "product", qty: 1, price: 20000, currency: "kzt" },
      { name: "Элегантная фотозона для құдалық", itemType: "service", qty: 1, price: 15000, currency: "kzt" },
    ];
    const summary = summarizeInvoice(lines, { vatPayer: false });
    const blob = await pdf(
      createElement(InvoiceDocument, {
        order: { number: 12, createdAt: "2026-10-13T22:48:00+05:00" },
        seller,
        buyer: { name: "Айгуль", phone: "77051406940", company: "", bin: "", address: "" },
        lines,
        summary,
        logo: "",
      })
    ).toBlob();
    const plain = pdfPlain(Buffer.from(await blob.arrayBuffer()));
    expect(hasGlyphs(plain, "Счёт на оплату № 12 от 13 октября 2026 г.")).toBe(true);
    expect(hasGlyphs(plain, "сырғақұдалықӘ₸№")).toBe(true);
    expect(hasGlyphs(plain, "Сто тысяч тенге 00 тиын")).toBe(true);
    expect(hasGlyphs(plain, "Без НДС")).toBe(true);
    expect(hasGlyphs(plain, "шт.усл.")).toBe(true);
    expect(hasGlyphs(plain, "Руководитель")).toBe(true);
  });
});
