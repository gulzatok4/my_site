import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CURRENCIES,
  addCustomCategory,
  categoriesForType,
  categoryLabel,
  createProductId,
  ensureCatalogProducts,
  ensureCatalogServices,
  itemTypeLabel,
  loadProducts,
  markSeedRemoved,
  normalizeCategory,
  normalizeCurrency,
  normalizeItemType,
  productStock,
  removeCategory,
  restoreDefaultCatalog,
  saveProducts,
  subscribeStore,
  trySaveProducts,
} from "../lib/catalog.js";
import { formatPrice } from "../lib/catalog.js";
import { compressImageFile, imageSrc } from "../lib/media.js";
import { CatalogPdfDialog } from "./CatalogPdfDialog.jsx";

const EMPTY = {
  id: "",
  itemType: "product",
  category: "baskets",
  name: "",
  stock: "",
  price: "0",
  currency: "kzt",
  description: "",
  link: "",
  image: "",
  pendingImage: "",
  keptImage: "",
  previewNote: "",
};

function adminPriceText(product) {
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) {
    return normalizeItemType(product.itemType) === "service" ? "от 15 000 ₸ (по сложности)" : "от 5 000 ₸";
  }
  return formatPrice(product.price, product.currency);
}

function adminStockText(product) {
  const stock = productStock(product);
  if (stock === null) return "";
  return stock === 0 ? "Нет в наличии" : `Остаток: ${stock} шт.`;
}

export function ProductsPanel() {
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [note, setNote] = useState("");
  const [pageNote, setPageNote] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [menu, setMenu] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [pageNoteLink, setPageNoteLink] = useState(null);

  const products = loadProducts();
  void tick;
  const services = products.filter((item) => normalizeItemType(item.itemType) === "service");
  const goods = products.filter((item) => normalizeItemType(item.itemType) !== "service");
  const categories = categoriesForType(form.itemType);
  const preview = form.pendingImage || form.keptImage || form.image;

  useEffect(() => {
    ensureCatalogProducts();
    ensureCatalogServices();
    setTick((n) => n + 1);
    return subscribeStore(() => setTick((n) => n + 1));
  }, []);

  useEffect(() => {
    document.body.classList.toggle("admin-modal-open", open || pdfOpen);
    return () => document.body.classList.remove("admin-modal-open");
  }, [open, pdfOpen]);

  useEffect(() => {
    function onPush(event) {
      const result = event.detail;
      if (result === "ok" || result === "unchanged") return;
      setPageNote(
        result === "unauthorized"
          ? "Изменения сохранены только в этом браузере. Войдите на вкладке «Заказы» (пароль админки) — после входа они сразу попадут на сайт."
          : "Сервер недоступен — изменения сохранены только в этом браузере. Запустите serve.ps1 и обновите страницу."
      );
    }
    window.addEventListener("gulzat:catalog-push", onPush);
    return () => window.removeEventListener("gulzat:catalog-push", onPush);
  }, []);

  function patch(partial) {
    setForm((current) => ({ ...current, ...partial }));
  }

  function close() {
    setOpen(false);
    setMenu("");
    setNote("");
  }

  function openCreate() {
    setForm({ ...EMPTY, category: categoriesForType("product")[0]?.code || "baskets" });
    setNote("");
    setOpen(true);
  }

  function openEdit(product) {
    const isData = Boolean(product.image?.startsWith("data:"));
    const stock = productStock(product);
    setForm({
      ...EMPTY,
      id: product.id || "",
      itemType: normalizeItemType(product.itemType),
      category: product.category,
      name: product.name || "",
      stock: stock === null ? "" : String(stock),
      price: Number.isFinite(Number(product.price)) ? String(product.price) : "0",
      currency: normalizeCurrency(product.currency),
      description: product.description || "",
      link: product.link || "",
      image: isData ? "" : product.image || "",
      keptImage: product.image || "",
      previewNote: product.image ? "Текущее фото. Можно заменить." : "",
    });
    setNote(`Редактирование: ${product.name}`);
    setOpen(true);
  }

  async function onFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNote("Выберите файл-изображение (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setNote("Файл слишком большой (больше 20 МБ). Выберите другое фото.");
      return;
    }
    setNote("Обрабатываю фото…");
    try {
      const data = await compressImageFile(file);
      patch({ pendingImage: data, keptImage: "", previewNote: `Новое фото: ${file.name}` });
      setNote("Рисунок обновлён. Нажмите «Сохранить».");
    } catch {
      patch({ pendingImage: "", previewNote: "" });
      setNote("Не удалось прочитать это фото. Попробуйте JPG или PNG.");
    }
  }

  function save(event) {
    event.preventDefault();
    const list = loadProducts();
    const price = form.price.trim() === "" ? 0 : Number(form.price);
    const itemType = normalizeItemType(form.itemType);
    const stockRaw = itemType === "service" ? "" : form.stock.trim();
    const stockValue = Number(stockRaw);
    if (!form.name.trim() || Number.isNaN(price) || price < 0) {
      setNote("Проверьте название и цену.");
      return;
    }
    if (stockRaw !== "" && (!Number.isFinite(stockValue) || stockValue < 0)) {
      setNote("Остаток — целое число от 0. Оставьте поле пустым, если ограничения нет.");
      return;
    }
    const fallbackImage = itemType === "service" ? "./images/service-it.png" : "./images/products-ready.png?v=6";
    const payload = {
      name: form.name.trim(),
      price,
      stock: stockRaw === "" ? null : Math.min(9999, Math.floor(stockValue)),
      currency: normalizeCurrency(form.currency),
      category: normalizeCategory(form.category, itemType),
      itemType,
      description: form.description.trim(),
      image: form.pendingImage || form.image.trim() || form.keptImage || fallbackImage,
      link: form.link.trim(),
    };
    if (form.id) {
      const index = list.findIndex((item) => item.id === form.id);
      if (index === -1) {
        setNote("Запись не найдена.");
        return;
      }
      list[index] = { ...list[index], ...payload };
      delete list[index].quantity;
    } else {
      list.unshift({ id: createProductId(), ...payload });
    }
    if (!trySaveProducts(list)) {
      setNote("Не хватило места в браузере для фото. Выберите картинку поменьше или удалите лишние позиции.");
      return;
    }
    const done = itemType === "service" ? (form.id ? "Услуга обновлена." : "Услуга добавлена на сайт.") : form.id ? "Товар обновлён." : "Товар добавлен на сайт.";
    const href = itemType === "service" ? "/services" : "/products";
    const label = itemType === "service" ? "Открыть все услуги" : "Открыть все товары";
    close();
    setTick((n) => n + 1);
    setPageNote(`${done} ${label}`);
    setPageNoteLink({ href, label, done });
  }

  function removeProduct(id) {
    if (!confirm("Удалить этот товар?")) return;
    markSeedRemoved(id);
    const next = loadProducts().filter((item) => item.id !== id);
    if (!trySaveProducts(next)) {
      setPageNote("Не удалось сохранить изменения.");
      return;
    }
    if (form.id === id) close();
    setPageNote("Товар удалён.");
    setPageNoteLink(null);
    setTick((n) => n + 1);
  }

  function clearShop() {
    if (
      !confirm(
        "Удалить все позиции из магазина?\n\nБазовые примеры (услуги и товары) восстановятся. Свои добавленные позиции пропадут безвозвратно."
      )
    ) {
      return;
    }
    saveProducts([]);
    restoreDefaultCatalog();
    close();
    setPageNote("Свои позиции удалены. Базовый каталог восстановлен.");
    setPageNoteLink(null);
    setTick((n) => n + 1);
  }

  function addCategory() {
    const created = addCustomCategory(newCategory, form.itemType);
    if (!created) {
      setNote("Введите название новой категории.");
      return;
    }
    patch({ category: created.code });
    setNewCategory("");
    setNote(`Категория «${created.label}» добавлена и выбрана.`);
    setTick((n) => n + 1);
  }

  function deleteCategory(code) {
    const label = categoryLabel(code, form.itemType);
    if (!confirm(`Удалить категорию «${label}»? Товары из неё перейдут в другую категорию.`)) return;
    const result = removeCategory(code, form.itemType);
    if (!result.ok) {
      setNote(result.reason === "last" ? "Нельзя удалить последнюю категорию." : "Не удалось удалить категорию.");
      return;
    }
    patch({ category: form.category === code ? result.fallback : form.category });
    setNote(`Категория «${result.label}» удалена.`);
    setTick((n) => n + 1);
  }

  function card(product) {
    return (
      <article className="admin-item" key={product.id}>
        <img src={imageSrc(product.image)} alt="" />
        <div>
          <h3>{product.name}</h3>
          <p className="admin-cat">
            {itemTypeLabel(product.itemType)} · {categoryLabel(product.category, product.itemType)}
          </p>
          <p className="admin-price">{adminPriceText(product)}</p>
          {adminStockText(product) ? <p className="admin-cat">{adminStockText(product)}</p> : null}
          <p>{product.description || ""}</p>
          {product.link ? (
            <p className="admin-link">
              <a href={product.link} target="_blank" rel="noopener noreferrer">
                Открыть ссылку
              </a>
            </p>
          ) : null}
        </div>
        <div className="admin-item-actions">
          <button type="button" className="btn btn-ghost" onClick={() => openEdit(product)}>
            Изменить
          </button>
          <button type="button" className="btn btn-danger" onClick={() => removeProduct(product.id)}>
            Удалить
          </button>
        </div>
      </article>
    );
  }

  return (
    <section className="admin-list-card admin-tab" id="products">
      <div className="admin-sticky-head">
        <div className="orders-head">
          <div>
            <h2>Товары и услуги</h2>
            <p className="admin-lead">
              <strong>Товар</strong> — изделия (корзины, наборы, пуфы), на сайте в «Все товары». <strong>Услуга</strong> — IT,
              сайты, боты, CRM и ИИ-ролики, в «Все услуги». Каталог хранится на сервере (<code>data/catalog.json</code>),
              изменения сразу видны на сайте с любого устройства.
            </p>
          </div>
          <div className="admin-head-actions">
            <button type="button" className="btn btn-ghost btn-danger-ghost" onClick={clearShop}>
              Очистить магазин
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPdfOpen(true)}>
              Каталог PDF
            </button>
            <button type="button" className="btn" onClick={openCreate}>
              Добавить товар
            </button>
          </div>
        </div>
      </div>
      <p className="form-note" role="status">
        {pageNoteLink ? (
          <>
            {pageNoteLink.done} <Link to={pageNoteLink.href}>{pageNoteLink.label} →</Link>
          </>
        ) : (
          pageNote
        )}
      </p>
      <div className="admin-list">
        {!products.length ? <p className="admin-empty">Пока пусто. Нажмите «Добавить товар».</p> : null}
        {products.length ? (
          <div className="admin-columns">
            <section className="admin-column">
              <h3 className="admin-list-title">Услуги ({services.length})</h3>
              <div className="admin-column-list">{services.length ? services.map(card) : <p className="admin-empty">Услуг пока нет.</p>}</div>
            </section>
            <section className="admin-column">
              <h3 className="admin-list-title">Товары ({goods.length})</h3>
              <div className="admin-column-list">{goods.length ? goods.map(card) : <p className="admin-empty">Товаров пока нет.</p>}</div>
            </section>
          </div>
        ) : null}
      </div>

      {pdfOpen ? <CatalogPdfDialog onClose={() => setPdfOpen(false)} /> : null}
      <div className="admin-modal" hidden={!open}>
        <div className="admin-modal-backdrop" onClick={close} />
        <div className="admin-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
          <div className="admin-modal-head">
            <h2 id="product-modal-title">{form.id ? "Изменить товар" : "Новый товар"}</h2>
            <button type="button" className="admin-modal-close" aria-label="Закрыть" onClick={close}>
              ×
            </button>
          </div>
          <form className="admin-modal-form" onSubmit={save}>
            <div className="field">
              <span className="field-label">Тип</span>
              <div className={`dd${menu === "type" ? " is-open" : ""}`}>
                <button type="button" className="dd-toggle" aria-expanded={menu === "type"} onClick={() => setMenu(menu === "type" ? "" : "type")}>
                  <span>{itemTypeLabel(form.itemType)}</span>
                  <span className="dd-caret" aria-hidden="true" />
                </button>
                <ul className="dd-menu" role="listbox" hidden={menu !== "type"}>
                  {[
                    ["product", "Товар"],
                    ["service", "Услуга"],
                  ].map(([code, label]) => (
                    <li
                      key={code}
                      role="option"
                      aria-selected={form.itemType === code}
                      onClick={() => {
                        const nextType = code;
                        patch({
                          itemType: nextType,
                          category: categoriesForType(nextType)[0]?.code || "",
                          stock: nextType === "service" ? "" : form.stock,
                        });
                        setMenu("");
                      }}
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="field">
              <span className="field-label">{form.itemType === "service" ? "Категория услуги" : "Категория товара"}</span>
              <div className={`dd${menu === "category" ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="dd-toggle"
                  aria-expanded={menu === "category"}
                  onClick={() => setMenu(menu === "category" ? "" : "category")}
                >
                  <span>{categoryLabel(form.category, form.itemType)}</span>
                  <span className="dd-caret" aria-hidden="true" />
                </button>
                <ul className="dd-menu" role="listbox" hidden={menu !== "category"}>
                  {categories.map((item) => (
                    <li key={item.code} role="option" className="category-option" aria-selected={form.category === item.code}>
                      <span className="category-option-label" onClick={() => { patch({ category: item.code }); setMenu(""); }}>
                        {item.label}
                      </span>
                      <button
                        type="button"
                        className="category-del-btn"
                        aria-label={`Удалить категорию «${item.label}»`}
                        title="Удалить"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteCategory(item.code);
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                  <li className="category-add-item" role="presentation">
                    <div className="category-add">
                      <input
                        type="text"
                        maxLength={40}
                        placeholder="Новая категория"
                        autoComplete="off"
                        value={newCategory}
                        onChange={(event) => setNewCategory(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addCategory();
                          }
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <button type="button" className="btn btn-ghost" onClick={addCategory}>
                        Добавить
                      </button>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <label>
              Название
              <input
                type="text"
                required
                maxLength={80}
                placeholder="Например: ИИ-ролик для Instagram"
                value={form.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </label>

            {form.itemType === "service" ? null : (
              <label className="field">
                <span className="field-label">Остаток на складе</span>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  step="1"
                  placeholder="Без ограничения"
                  value={form.stock}
                  onChange={(event) => patch({ stock: event.target.value })}
                />
                <span className="field-hint">Пусто — без ограничения, 0 — нет в наличии</span>
              </label>
            )}

            <div className="field-row">
              <label className="field">
                <span className="field-label">Цена</span>
                <input type="number" min="0" step="1" value={form.price} onChange={(event) => patch({ price: event.target.value })} />
              </label>
              <div className="field">
                <span className="field-label">Валюта</span>
                <div className={`dd${menu === "currency" ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="dd-toggle"
                    aria-expanded={menu === "currency"}
                    onClick={() => setMenu(menu === "currency" ? "" : "currency")}
                  >
                    <span>{CURRENCIES[form.currency]?.label || "Тенге (₸)"}</span>
                    <span className="dd-caret" aria-hidden="true" />
                  </button>
                  <ul className="dd-menu" role="listbox" hidden={menu !== "currency"}>
                    {Object.values(CURRENCIES).map((item) => (
                      <li
                        key={item.code}
                        role="option"
                        aria-selected={form.currency === item.code}
                        onClick={() => {
                          patch({ currency: item.code });
                          setMenu("");
                        }}
                      >
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <p className="field-hint wide">0 = цена по запросу / от … ₸ на сайте</p>
            <label className="wide">
              Описание
              <textarea
                rows={2}
                maxLength={280}
                placeholder="Коротко: что сделано, для кого, результат"
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </label>
            <label className="wide">
              Ссылка на ролик / работу (необязательно)
              <input
                type="url"
                placeholder="https://youtube.com/... или Instagram / TikTok"
                value={form.link}
                onChange={(event) => patch({ link: event.target.value })}
              />
            </label>
            <label>
              <span>Фото</span>
              <input
                type="text"
                placeholder="https://... или загрузите файл ниже"
                value={form.image}
                onChange={(event) => patch({ image: event.target.value, pendingImage: "" })}
              />
            </label>
            <label>
              <span>Загрузить с компьютера</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp"
                onChange={(event) => onFile(event.target.files?.[0])}
              />
            </label>
            <div className="wide photo-preview" hidden={!preview}>
              {preview ? <img src={imageSrc(preview)} alt="Превью фото" onClick={() => document.getElementById("product-file-proxy")?.click()} /> : null}
              <p>{form.previewNote}</p>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="btn">
                Сохранить
              </button>
              <button type="button" className="btn btn-ghost" onClick={close}>
                Отмена
              </button>
            </div>
            <p className="form-note" role="status">
              {note}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
