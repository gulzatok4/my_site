import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { PHONE, formatPhone, normalizeItemType } from "../lib/catalog.js";
import { cartLinePrice } from "../lib/display.js";
import { CatalogDocument } from "./CatalogDocument.jsx";
import { InvoiceDocument } from "./InvoiceDocument.jsx";
import { registerPdfFonts } from "./fonts.js";
import { prepareCatalogImages } from "./images.js";
import { summarizeInvoice } from "./money.js";
import { catalogSections } from "./select.js";
import { clipText, formatCatalogDate } from "./strings.js";

export function catalogFileName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `Gulzat_Katalog_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.pdf`;
}

export async function downloadCatalogPdf(options) {
  const { blob, failed } = await buildCatalogBlob(options);
  saveBlob(blob, catalogFileName());
  return failed;
}

export async function shareCatalogPdf(options) {
  const { blob, failed } = await buildCatalogBlob(options);
  const name = catalogFileName();
  const file = new File([blob], name, { type: "application/pdf" });
  if (typeof navigator.share !== "function" || !navigator.canShare?.({ files: [file] })) {
    const error = new Error("share_unavailable");
    error.file = file;
    throw error;
  }
  try {
    await navigator.share({ files: [file], title: name });
  } catch (reason) {
    const error = new Error(reason?.message || "share_failed");
    error.name = reason?.name || "Error";
    error.file = file;
    throw error;
  }
  return failed;
}

export async function buildCatalogBlob({ scope, selectedKeys, showPrices }) {
  registerPdfFonts();
  const sections = catalogSections({ scope, selectedKeys });
  const products = sections.flatMap((section) => section.products);
  const { logo, photos, failed } = await prepareCatalogImages(products);
  let photoIndex = 0;
  const view = sections.map((section) => ({
    code: section.code,
    label: section.label,
    cards: section.products.map((product) => {
      const image = photos[photoIndex];
      photoIndex += 1;
      const price = Number(product.price) || 0;
      return {
        key: String(product.id || photoIndex),
        name: String(product.name || "").trim() || "—",
        description: clipText(product.description, 110),
        image,
        priceText: showPrices ? cartLinePrice({ unit: price, lineTotal: price, product }, "ru") : "",
        href: serviceHref(product),
      };
    }),
  }));
  const blob = await pdf(
    createElement(CatalogDocument, {
      scope,
      logo,
      phone: formatPhone(PHONE),
      dateLabel: formatCatalogDate(new Date()),
      sections: view,
    })
  ).toBlob();
  return { blob, failed };
}

function serviceHref(product) {
  if (normalizeItemType(product.itemType) !== "service") return "";
  const raw = String(product.link || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}

export function invoiceFileName(number) {
  const safe = String(number ?? "").replace(/[\\/:*?"<>|]/g, "").trim() || "0";
  return `Gulzat_Schet_${safe}.pdf`;
}

export async function downloadInvoicePdf(payload) {
  const blob = await buildInvoiceBlob(payload);
  saveBlob(blob, invoiceFileName(payload.order?.number));
}

export async function shareInvoicePdf(payload) {
  const blob = await buildInvoiceBlob(payload);
  const name = invoiceFileName(payload.order?.number);
  const file = new File([blob], name, { type: "application/pdf" });
  if (typeof navigator.share !== "function" || !navigator.canShare?.({ files: [file] })) {
    const error = new Error("share_unavailable");
    error.file = file;
    throw error;
  }
  try {
    await navigator.share({ files: [file], title: name });
  } catch (reason) {
    const error = new Error(reason?.message || "share_failed");
    error.name = reason?.name || "Error";
    error.file = file;
    throw error;
  }
}

export async function buildInvoiceBlob({ order, seller, buyer, lines }) {
  const summary = summarizeInvoice(lines, { vatPayer: seller?.vatPayer, vatRate: seller?.vatRate });
  if (!summary.ok) {
    const error = new Error(summary.reason || "invoice");
    throw error;
  }
  registerPdfFonts();
  const { logo } = await prepareCatalogImages([]);
  return pdf(createElement(InvoiceDocument, { order, seller, buyer, lines, summary, logo })).toBlob();
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
