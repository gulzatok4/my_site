import { categoryChoices, loadProducts, normalizeItemType } from "../lib/catalog.js";

export function choicesForScope(scope) {
  if (scope === "all") return [...categoryChoices("product"), ...categoryChoices("service")];
  return categoryChoices(scope === "services" ? "service" : "product");
}

export function choiceKey(choice) {
  return `${choice.itemType}:${choice.code}`;
}

export function catalogSections({ scope, selectedKeys }) {
  const selected = new Set(selectedKeys || []);
  const indexed = loadProducts().map((product, index) => ({
    product,
    position: Number.isFinite(Number(product?.position)) ? Number(product.position) : index,
  }));
  const sections = [];
  for (const choice of choicesForScope(scope)) {
    if (!selected.has(choiceKey(choice))) continue;
    const products = indexed
      .filter(
        ({ product }) =>
          normalizeItemType(product.itemType) === choice.itemType &&
          String(product.category || "").trim().toLowerCase() === choice.code
      )
      .sort((a, b) => a.position - b.position)
      .map(({ product }) => product);
    if (products.length) sections.push({ code: choiceKey(choice), label: choice.label, products });
  }
  return sections;
}

export function catalogMatchCount(options) {
  return catalogSections(options).reduce((sum, section) => sum + section.products.length, 0);
}
