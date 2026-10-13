const form = document.getElementById("product-form");
const listEl = document.getElementById("admin-list");
const note = document.getElementById("admin-note");
const pageNote = document.getElementById("admin-page-note");
const saveBtn = document.getElementById("save-btn");
const cancelBtn = document.getElementById("cancel-edit");
const fileInput = document.getElementById("product-file");
const idInput = document.getElementById("product-id");
const nameInput = document.getElementById("product-name");
const priceInput = document.getElementById("product-price");
const stockInput = document.getElementById("product-stock");
const stockField = document.getElementById("stock-field");
const currencyInput = document.getElementById("product-currency");
const currencyToggle = document.getElementById("currency-dd-toggle");
const currencyLabel = document.getElementById("currency-dd-label");
const currencyMenu = document.getElementById("currency-dd-menu");
const currencyDd = document.getElementById("currency-dd");
const categoryInput = document.getElementById("product-category");
const categoryToggle = document.getElementById("category-dd-toggle");
const categoryLabelEl = document.getElementById("category-dd-label");
const categoryMenu = document.getElementById("category-dd-menu");
const categoryDd = document.getElementById("category-dd");
const categoryFieldLabel = document.getElementById("category-field-label");
const typeInput = document.getElementById("product-item-type");
const typeToggle = document.getElementById("type-dd-toggle");
const typeLabelEl = document.getElementById("type-dd-label");
const typeMenu = document.getElementById("type-dd-menu");
const typeDd = document.getElementById("type-dd");
const modal = document.getElementById("product-modal");
const modalTitle = document.getElementById("product-modal-title");
const openModalBtn = document.getElementById("open-product-modal");
const closeModalBtn = document.getElementById("close-product-modal");
const descInput = document.getElementById("product-description");
const imageInput = document.getElementById("product-image");
const linkInput = document.getElementById("product-link");
const priceHint = document.getElementById("price-hint");
const imageUrlLabel = document.getElementById("image-url-label");
const imageFileLabel = document.getElementById("image-file-label");
const photoPreview = document.getElementById("photo-preview");
const photoPreviewImg = document.getElementById("photo-preview-img");
const photoPreviewNote = document.getElementById("photo-preview-note");
const changePhotoBtn = document.getElementById("change-photo-btn");
const clearPhotoBtn = document.getElementById("clear-photo-btn");

let pendingImageData = "";
let keptImagePath = "";

function syncTypeUi(itemType) {
  const isService = normalizeItemType(itemType) === "service";
  if (stockField) stockField.hidden = isService;
  if (categoryFieldLabel) {
    categoryFieldLabel.textContent = isService ? "Категория услуги" : "Категория товара";
  }
  if (priceHint) {
    priceHint.textContent = isService
      ? "Можно 0 — на сайте будет: от 15 000 ₸ (по сложности)"
      : "Можно 0 — на сайте будет: индивидуальные заказы от 5 000 ₸";
  }
  if (imageUrlLabel) {
    imageUrlLabel.textContent = isService ? "Фото / обложка" : "Фото";
  }
  if (imageFileLabel) {
    imageFileLabel.textContent = isService
      ? "Загрузить обложку с компьютера"
      : "Загрузить с компьютера";
  }
}

function openProductModal(mode = "create") {
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("admin-modal-open");
  if (modalTitle) {
    modalTitle.textContent = mode === "edit" ? "Изменить товар" : "Новый товар";
  }
  requestAnimationFrame(() => nameInput?.focus());
}

function closeProductModal() {
  if (!modal) return;
  closeAllDropdowns();
  modal.hidden = true;
  document.body.classList.remove("admin-modal-open");
  resetForm();
  if (note) note.textContent = "";
}

function currencyLabelText(code) {
  return CURRENCIES[normalizeCurrency(code)]?.label || CURRENCIES.kzt.label;
}

function closeAllDropdowns() {
  closeCurrencyDd();
  closeCategoryDd();
  closeTypeDd();
}

function openTypeDd() {
  if (!typeDd || !typeMenu || !typeToggle) return;
  closeAllDropdowns();
  typeDd.classList.add("is-open");
  typeMenu.hidden = false;
  typeToggle.setAttribute("aria-expanded", "true");
}

function closeTypeDd() {
  if (!typeDd || !typeMenu || !typeToggle) return;
  typeDd.classList.remove("is-open");
  typeMenu.hidden = true;
  typeToggle.setAttribute("aria-expanded", "false");
}

function setCurrency(code) {
  const value = normalizeCurrency(code);
  if (currencyInput) currencyInput.value = value;
  if (currencyLabel) currencyLabel.textContent = currencyLabelText(value);
  currencyMenu?.querySelectorAll("[role='option']").forEach((item) => {
    item.setAttribute("aria-selected", item.getAttribute("data-value") === value ? "true" : "false");
  });
  closeCurrencyDd();
}

function openCurrencyDd() {
  if (!currencyDd || !currencyMenu || !currencyToggle) return;
  closeAllDropdowns();
  currencyDd.classList.add("is-open");
  currencyMenu.hidden = false;
  currencyToggle.setAttribute("aria-expanded", "true");
}

function closeCurrencyDd() {
  if (!currencyDd || !currencyMenu || !currencyToggle) return;
  currencyDd.classList.remove("is-open");
  currencyMenu.hidden = true;
  currencyToggle.setAttribute("aria-expanded", "false");
}

function rebuildCategoryMenu(itemType) {
  const list = categoriesForType(itemType);
  if (!categoryMenu) return;
  const selected = categoryInput?.value || list[0]?.code;
  const options = list
    .map((item) => {
      const delBtn = `<button type="button" class="category-del-btn" data-del-category="${escapeHtml(item.code)}" aria-label="Удалить категорию «${escapeHtml(item.label)}»" title="Удалить">×</button>`;
      return `<li role="option" class="category-option" data-value="${escapeHtml(item.code)}" aria-selected="${item.code === selected ? "true" : "false"}"><span class="category-option-label">${escapeHtml(item.label)}</span>${delBtn}</li>`;
    })
    .join("");
  categoryMenu.innerHTML = `${options}
    <li class="category-add-item" role="presentation">
      <div class="category-add">
        <input type="text" id="new-category-name" maxlength="40" placeholder="Новая категория" autocomplete="off" />
        <button type="button" class="btn btn-ghost" id="add-category-btn">Добавить</button>
      </div>
    </li>`;
  bindCategoryAddControls();
}

function bindCategoryAddControls() {
  const input = document.getElementById("new-category-name");
  const btn = document.getElementById("add-category-btn");
  btn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleAddCategory();
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    handleAddCategory();
  });
  input?.addEventListener("mousedown", (event) => event.stopPropagation());
  input?.addEventListener("click", (event) => event.stopPropagation());
}

function setCategory(code, itemType = typeInput?.value) {
  const type = normalizeItemType(itemType);
  const value = normalizeCategory(code, type);
  if (categoryInput) categoryInput.value = value;
  if (categoryLabelEl) categoryLabelEl.textContent = categoryLabel(value, type);
  categoryMenu?.querySelectorAll("[role='option']").forEach((item) => {
    item.setAttribute("aria-selected", item.getAttribute("data-value") === value ? "true" : "false");
  });
  closeCategoryDd();
}

function openCategoryDd() {
  if (!categoryDd || !categoryMenu || !categoryToggle) return;
  closeAllDropdowns();
  categoryDd.classList.add("is-open");
  categoryMenu.hidden = false;
  categoryToggle.setAttribute("aria-expanded", "true");
}

function closeCategoryDd() {
  if (!categoryDd || !categoryMenu || !categoryToggle) return;
  categoryDd.classList.remove("is-open");
  categoryMenu.hidden = true;
  categoryToggle.setAttribute("aria-expanded", "false");
}

function setItemType(code, keepCategory = false) {
  const value = normalizeItemType(code);
  const prev = normalizeItemType(typeInput?.value);
  if (typeInput) typeInput.value = value;
  if (typeLabelEl) typeLabelEl.textContent = itemTypeLabel(value);
  typeMenu?.querySelectorAll("[role='option']").forEach((item) => {
    item.setAttribute("aria-selected", item.getAttribute("data-value") === value ? "true" : "false");
  });
  closeTypeDd();
  syncTypeUi(value);
  rebuildCategoryMenu(value);
  if (!keepCategory || prev !== value) {
    setCategory(categoriesForType(value)[0].code, value);
  } else {
    setCategory(categoryInput?.value, value);
  }
}

function setNote(text, onPage = false) {
  if (note) note.textContent = text;
  if (pageNote && (onPage || !modal || modal.hidden)) {
    pageNote.textContent = text;
  }
}

function setNoteHtml(html, onPage = false) {
  if (note) note.innerHTML = html;
  if (pageNote && (onPage || !modal || modal.hidden)) {
    pageNote.innerHTML = html;
  }
}

function showPreview(src, text) {
  if (!photoPreview || !photoPreviewImg) return;
  if (!src) {
    photoPreview.hidden = true;
    photoPreviewImg.removeAttribute("src");
    if (photoPreviewNote) photoPreviewNote.textContent = "";
    if (changePhotoBtn) changePhotoBtn.hidden = true;
    if (clearPhotoBtn) clearPhotoBtn.hidden = true;
    return;
  }
  photoPreview.hidden = false;
  photoPreviewImg.src = src;
  if (photoPreviewNote) photoPreviewNote.textContent = text || "";
  if (changePhotoBtn) changePhotoBtn.hidden = false;
  if (clearPhotoBtn) clearPhotoBtn.hidden = false;
}

function compressImageFile(file, maxSide = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas"));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("image"));
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function resetForm() {
  form?.reset();
  if (idInput) idInput.value = "";
  pendingImageData = "";
  keptImagePath = "";
  if (fileInput) fileInput.value = "";
  if (linkInput) linkInput.value = "";
  if (priceInput) priceInput.value = "0";
  if (stockInput) stockInput.value = "";
  setCurrency("kzt");
  setItemType("product");
  showPreview("");
  if (saveBtn) saveBtn.textContent = "Сохранить";
  if (modalTitle) modalTitle.textContent = "Новый товар";
}

function fillForm(product) {
  idInput.value = product.id || "";
  nameInput.value = product.name || "";
  priceInput.value = Number.isFinite(Number(product.price)) ? String(product.price) : "0";
  if (stockInput) {
    const stock = productStock(product);
    stockInput.value = stock === null ? "" : String(stock);
  }
  setCurrency(product.currency);
  setItemType(product.itemType || "product", true);
  setCategory(product.category, product.itemType || "product");
  descInput.value = product.description || "";
  if (linkInput) linkInput.value = product.link || "";
  const isData = Boolean(product.image?.startsWith("data:"));
  imageInput.value = isData ? "" : product.image || "";
  pendingImageData = "";
  keptImagePath = product.image || "";
  const kind = normalizeItemType(product.itemType) === "service" ? "услуги" : "товара";
  showPreview(product.image || "", product.image ? `Текущее фото ${kind}. Можно заменить.` : "");
  if (saveBtn) saveBtn.textContent = "Сохранить";
  if (modalTitle) modalTitle.textContent = "Изменить товар";
}

function adminPriceText(p) {
  const price = Number(p.price);
  if (!Number.isFinite(price) || price <= 0) {
    return normalizeItemType(p.itemType) === "service"
      ? "от 15 000 ₸ (по сложности)"
      : "от 5 000 ₸";
  }
  return formatPrice(p.price, p.currency);
}

function adminStockText(p) {
  const stock = productStock(p);
  if (stock === null) return "";
  return stock === 0 ? "Нет в наличии" : `Остаток: ${stock} шт.`;
}

function renderAdminList() {
  if (typeof ensureCatalogProducts === "function") ensureCatalogProducts();
  if (typeof ensureCatalogServices === "function") ensureCatalogServices();

  const products = loadProducts();
  if (!products.length) {
    listEl.innerHTML = `<p class="admin-empty">Пока пусто. Нажмите «Добавить товар».</p>`;
    return;
  }

  const services = products.filter((p) => normalizeItemType(p.itemType) === "service");
  const goods = products.filter((p) => normalizeItemType(p.itemType) !== "service");

  const card = (p) => `
      <article class="admin-item" data-id="${p.id}">
        <img src="${escapeHtml(p.image)}" alt="" />
        <div>
          <h3>${escapeHtml(p.name)}</h3>
          <p class="admin-cat">${escapeHtml(itemTypeLabel(p.itemType))} · ${escapeHtml(categoryLabel(p.category, p.itemType))}</p>
          <p class="admin-price">${escapeHtml(adminPriceText(p))}</p>
          ${adminStockText(p) ? `<p class="admin-cat">${escapeHtml(adminStockText(p))}</p>` : ""}
          <p>${escapeHtml(p.description || "")}</p>
          ${
            p.link
              ? `<p class="admin-link"><a href="${escapeHtml(p.link)}" target="_blank" rel="noopener noreferrer">Открыть ссылку</a></p>`
              : ""
          }
        </div>
        <div class="admin-item-actions">
          <button type="button" class="btn btn-ghost" data-edit="${escapeHtml(p.id)}">Изменить</button>
          <button type="button" class="btn btn-danger" data-del="${escapeHtml(p.id)}">Удалить</button>
        </div>
      </article>`;

  listEl.innerHTML = `
    <div class="admin-columns">
      <section class="admin-column">
        <h3 class="admin-list-title">Услуги (${services.length})</h3>
        <div class="admin-column-list">
          ${
            services.length
              ? services.map(card).join("")
              : `<p class="admin-empty">Услуг пока нет.</p>`
          }
        </div>
      </section>
      <section class="admin-column">
        <h3 class="admin-list-title">Товары (${goods.length})</h3>
        <div class="admin-column-list">
          ${
            goods.length
              ? goods.map(card).join("")
              : `<p class="admin-empty">Товаров пока нет.</p>`
          }
        </div>
      </section>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

fileInput?.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setNote("Выберите файл-изображение (JPG, PNG, WEBP).");
    fileInput.value = "";
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    setNote("Файл слишком большой (больше 20 МБ). Выберите другое фото.");
    fileInput.value = "";
    return;
  }

  setNote("Обрабатываю фото…");
  try {
    pendingImageData = await compressImageFile(file);
    keptImagePath = "";
    showPreview(pendingImageData, `Новое фото: ${file.name}`);
    setNote("Рисунок обновлён. Нажмите «Сохранить».");
  } catch {
    pendingImageData = "";
    showPreview("");
    setNote("Не удалось прочитать это фото. Попробуйте JPG или PNG.");
    fileInput.value = "";
  }
});

changePhotoBtn?.addEventListener("click", () => {
  fileInput?.click();
});

clearPhotoBtn?.addEventListener("click", () => {
  pendingImageData = "";
  keptImagePath = "";
  if (imageInput) imageInput.value = "";
  if (fileInput) fileInput.value = "";
  showPreview("");
  setNote("Фото убрано. При сохранении подставится картинка по умолчанию, либо укажите ссылку.");
});

photoPreviewImg?.addEventListener("click", () => {
  fileInput?.click();
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const products = loadProducts();
  const id = idInput.value.trim();
  const name = nameInput.value.trim();
  const priceRaw = priceInput.value.trim();
  const price = priceRaw === "" ? 0 : Number(priceRaw);
  const currency = normalizeCurrency(currencyInput?.value);
  const itemType = normalizeItemType(typeInput?.value);
  const stockRaw = itemType === "service" ? "" : String(stockInput?.value || "").trim();
  const stockValue = Number(stockRaw);
  const stock = stockRaw === "" ? null : Math.min(9999, Math.floor(stockValue));
  const category = normalizeCategory(categoryInput?.value, itemType);
  const description = descInput.value.trim();
  const link = String(linkInput?.value || "").trim();
  const imageFromUrl = imageInput.value.trim();
  const fallbackImage =
    itemType === "service" ? "./images/service-it.png" : "./images/products-ready.png?v=6";
  const image = pendingImageData || imageFromUrl || keptImagePath || fallbackImage;

  if (!name || Number.isNaN(price) || price < 0) {
    setNote("Проверьте название и цену.");
    return;
  }
  if (stockRaw !== "" && (!Number.isFinite(stockValue) || stockValue < 0)) {
    setNote("Остаток — целое число от 0. Оставьте поле пустым, если ограничения нет.");
    return;
  }

  const payload = {
    name,
    price,
    stock,
    currency,
    category,
    itemType,
    description,
    image,
    link,
  };

  if (id) {
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) {
      setNote("Запись не найдена.");
      return;
    }
    products[index] = {
      ...products[index],
      ...payload,
    };
    delete products[index].quantity;
  } else {
    products.unshift({
      id: createProductId(),
      ...payload,
    });
  }

  if (!trySaveProducts(products)) {
    setNote("Не хватило места в браузере для фото. Выберите картинку поменьше или удалите лишние позиции.");
    return;
  }

  const done =
    itemType === "service"
      ? id
        ? "Услуга обновлена."
        : "Услуга добавлена на сайт."
      : id
        ? "Товар обновлён."
        : "Товар добавлен на сайт.";
  const viewHref = itemType === "service" ? "./services.html" : "./products.html";
  const viewLabel = itemType === "service" ? "Открыть все услуги" : "Открыть все товары";
  closeProductModal();
  renderAdminList();
  if (typeof renderShop === "function") renderShop();
  setNoteHtml(`${done} <a href="${viewHref}">${viewLabel} →</a>`, true);
});

openModalBtn?.addEventListener("click", () => {
  resetForm();
  setNote("");
  openProductModal("create");
});

modal?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("[data-close-modal]")) {
    event.preventDefault();
    closeProductModal();
  }
});

closeModalBtn?.addEventListener("click", () => closeProductModal());

cancelBtn?.addEventListener("click", () => {
  closeProductModal();
});

listEl?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const editBtn = target.closest("[data-edit]");
  if (editBtn) {
    event.preventDefault();
    event.stopPropagation();
    const editId = editBtn.getAttribute("data-edit");
    const product = loadProducts().find((p) => p.id === editId);
    if (!product) {
      setNote("Не удалось найти запись. Обновите страницу (Ctrl+F5).");
      return;
    }
    try {
      fillForm(product);
      openProductModal("edit");
      setNote(`Редактирование: ${product.name}`);
    } catch (error) {
      console.error(error);
      setNote("Ошибка при открытии формы. Обновите страницу (Ctrl+F5).");
    }
    return;
  }

  const delBtn = target.closest("[data-del]");
  if (delBtn) {
    event.preventDefault();
    const delId = delBtn.getAttribute("data-del");
    if (!confirm("Удалить этот товар?")) return;
    if (typeof markSeedRemoved === "function") markSeedRemoved(delId);
    const next = loadProducts().filter((p) => p.id !== delId);
    if (!trySaveProducts(next)) {
      setNote("Не удалось сохранить изменения.");
      return;
    }
    setNote("Товар удалён.", true);
    if (idInput.value === delId) closeProductModal();
    renderAdminList();
    if (typeof renderShop === "function") renderShop();
  }
});

document.getElementById("clear-products")?.addEventListener("click", () => {
  if (
    !confirm(
      "Удалить все позиции из магазина?\n\nБазовые примеры (услуги и товары) восстановятся. Свои добавленные позиции пропадут безвозвратно."
    )
  ) {
    return;
  }
  saveProducts([]);
  if (typeof restoreDefaultCatalog === "function") {
    restoreDefaultCatalog();
  } else if (typeof clearRemovedSeeds === "function") {
    clearRemovedSeeds();
    ensureCatalogProducts();
    ensureCatalogServices();
  }
  closeProductModal();
  renderAdminList();
  if (typeof renderShop === "function") renderShop();
  setNote("Свои позиции удалены. Базовый каталог восстановлен.", true);
});

// Если магазин пустой после «Очистить» — вернуть базовые позиции
if (typeof loadProducts === "function" && loadProducts().length === 0 && typeof restoreDefaultCatalog === "function") {
  restoreDefaultCatalog();
}

renderAdminList();
setCurrency("kzt");
setItemType("product");

function onCatalogPush(result) {
  if (result === "ok" || result === "unchanged") return;
  setNote(
    result === "unauthorized"
      ? "Изменения сохранены только в этом браузере. Войдите на вкладке «Заказы» (пароль админки) — после входа они сразу попадут на сайт."
      : "Сервер недоступен — изменения сохранены только в этом браузере. Запустите serve.ps1 и обновите страницу.",
    true
  );
}

if (typeof syncCatalogFromServer === "function") {
  syncCatalogFromServer({ mergeLocalOnce: true }).then((result) => {
    enableCatalogPush(onCatalogPush);
    if (!result.ok) {
      setNote(
        "Сервер недоступен — товары сохраняются только в этом браузере. Запустите serve.ps1 и откройте http://127.0.0.1:8765/admin.html",
        true
      );
      return;
    }
    renderAdminList();
    if (result.empty || result.merged) scheduleCatalogPush();
  });
  window.addEventListener("gulzat:orders-updated", () => scheduleCatalogPush());
}

currencyToggle?.addEventListener("click", (event) => {
  event.preventDefault();
  if (currencyDd?.classList.contains("is-open")) closeCurrencyDd();
  else openCurrencyDd();
});

currencyMenu?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-value]");
  if (!option) return;
  setCurrency(option.getAttribute("data-value"));
});

typeToggle?.addEventListener("click", (event) => {
  event.preventDefault();
  if (typeDd?.classList.contains("is-open")) closeTypeDd();
  else openTypeDd();
});

typeMenu?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-value]");
  if (!option) return;
  setItemType(option.getAttribute("data-value"));
});

categoryToggle?.addEventListener("click", (event) => {
  event.preventDefault();
  if (categoryDd?.classList.contains("is-open")) closeCategoryDd();
  else openCategoryDd();
});

function handleAddCategory() {
  const input = document.getElementById("new-category-name");
  const label = input?.value || "";
  const itemType = typeInput?.value || "product";
  const created = addCustomCategory(label, itemType);
  if (!created) {
    setNote("Введите название новой категории.");
    input?.focus();
    return;
  }
  rebuildCategoryMenu(itemType);
  setCategory(created.code, itemType);
  setNote(`Категория «${created.label}» добавлена и выбрана.`);
}

function handleDeleteCategory(code) {
  const itemType = typeInput?.value || "product";
  const label = categoryLabel(code, itemType);
  if (!confirm(`Удалить категорию «${label}»? Товары из неё перейдут в другую категорию.`)) return;

  const wasSelected = categoryInput?.value === code;
  const result = removeCategory(code, itemType);
  if (!result.ok) {
    if (result.reason === "last") {
      setNote("Нельзя удалить последнюю категорию.");
    } else {
      setNote("Не удалось удалить категорию.");
    }
    return;
  }

  rebuildCategoryMenu(itemType);
  if (wasSelected) {
    setCategory(result.fallback || categoriesForType(itemType)[0]?.code, itemType);
  } else {
    setCategory(categoryInput?.value, itemType);
  }
  renderAdminList();
  setNote(`Категория «${result.label}» удалена.`);
}

categoryMenu?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const delBtn = target.closest("[data-del-category]");
  if (delBtn) {
    event.preventDefault();
    event.stopPropagation();
    handleDeleteCategory(delBtn.getAttribute("data-del-category"));
    return;
  }

  if (target.closest(".category-add-item")) return;
  const option = target.closest("[data-value]");
  if (!option) return;
  setCategory(option.getAttribute("data-value"));
});

document.addEventListener("click", (event) => {
  if (!currencyDd?.contains(event.target)) closeCurrencyDd();
  if (!categoryDd?.contains(event.target)) closeCategoryDd();
  if (!typeDd?.contains(event.target)) closeTypeDd();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (modal && !modal.hidden) {
      closeProductModal();
      return;
    }
    closeAllDropdowns();
  }
});

document.addEventListener(
  "wheel",
  (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.type === "number" &&
      document.activeElement === target
    ) {
      event.preventDefault();
    }
  },
  { passive: false }
);
