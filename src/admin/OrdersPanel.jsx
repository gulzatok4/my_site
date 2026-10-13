import { useEffect, useRef, useState } from "react";
import { CURRENCIES, formatDueDate, formatPhone, formatPrice, normalizeCurrency } from "../lib/catalog.js";
import { adminFetch, adminKey, setAdminKey } from "../lib/adminSession.js";
import { downloadXlsx, exportDateStamp } from "../lib/xlsx.js";

const STATUSES = [
  { code: "new", label: "Новый", filter: "Новые" },
  { code: "work", label: "В работе", filter: "В работе" },
  { code: "done", label: "Выполнен", filter: "Выполненные" },
  { code: "cancel", label: "Отменён", filter: "Отменённые" },
];
const ALERTS_KEY = "gulzat_order_alerts";

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(code) {
  return STATUSES.find((item) => item.code === code)?.label || code;
}

function linePrice(item) {
  const price = Number(item.price) || 0;
  if (price <= 0) return item.itemType === "service" ? "от 15 000 ₸" : "от 5 000 ₸";
  return formatPrice(price * (Number(item.qty) || 1), item.currency);
}

function orderTotal(order) {
  const byCurrency = {};
  (order.items || []).forEach((item) => {
    const price = Number(item.price) || 0;
    if (price <= 0) return;
    const code = normalizeCurrency(item.currency);
    byCurrency[code] = (byCurrency[code] || 0) + price * (Number(item.qty) || 1);
  });
  return Object.entries(byCurrency)
    .map(([code, sum]) => formatPrice(sum, code))
    .join(" · ");
}

function matchesQuery(order, q, qDigits) {
  const items = (Array.isArray(order.items) ? order.items : []).map((item) => item.name).join(" ");
  const text = [order.number, order.name, items, order.color, order.comment, formatDueDate(order.dueDate), order.note, order.cancelReason]
    .map((value) => value || "")
    .join(" ")
    .toLowerCase();
  if (text.includes(q)) return true;
  if (!qDigits) return false;
  const phone = String(order.phone || "").replace(/\D/g, "");
  const local = qDigits.startsWith("8") ? `7${qDigits.slice(1)}` : "";
  return phone.includes(qDigits) || Boolean(local && phone.startsWith(local));
}

function clientWhatsAppUrl(order, digits) {
  const items = Array.isArray(order.items) ? order.items : [];
  const name = String(order.name || "").trim();
  const lines = [name ? `Здравствуйте, ${name}!` : "Здравствуйте!"];
  if (items.length === 1) lines.push(`Вы хотели заказать у нас «${items[0].name}» × ${items[0].qty || 1}.`);
  else if (items.length > 1) {
    lines.push("Вы хотели заказать у нас:");
    items.forEach((item) => lines.push(`— ${item.name} × ${item.qty || 1}`));
  } else lines.push("Вы хотели сделать у нас заказ.");
  const total = orderTotal(order);
  if (total) lines.push(`Итого: ${total}`);
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function NoteField({ order, onSave }) {
  const [value, setValue] = useState(order.note || "");
  const [status, setStatus] = useState("");
  const timer = useRef(0);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setValue(order.note || "");
  }, [order.note, order.id]);

  async function save(next) {
    const note = next.trim();
    if (note === (order.note || "")) return;
    setStatus("сохраняю…");
    try {
      await adminFetch(`/api/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ note }),
      });
      onSave(note);
      setStatus("сохранено");
    } catch (error) {
      setStatus(error.status === 401 ? "войдите заново" : "не сохранилось");
    }
  }

  return (
    <label className="client-note-box">
      <span className="client-note-label">
        Заметка <small>{status}</small>
      </span>
      <textarea
        className="client-note-input"
        rows={2}
        maxLength={1000}
        placeholder="Например: цвет бордо, к 15 ноября, предоплата 50%"
        value={value}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          setStatus("");
          clearTimeout(timer.current);
          timer.current = setTimeout(() => save(next), 1200);
        }}
        onBlur={(event) => {
          focused.current = false;
          clearTimeout(timer.current);
          save(event.target.value);
        }}
      />
    </label>
  );
}

function InvoiceDialogView({ invoice, onClose }) {
  const Dialog = invoice.Dialog;
  return <Dialog order={invoice.order} seller={invoice.seller} onClose={onClose} />;
}

export function OrdersPanel({ onBadge }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [needLogin, setNeedLogin] = useState(!adminKey());
  const [password, setPassword] = useState("");
  const [pendingCancel, setPendingCancel] = useState("");
  const [alerts, setAlerts] = useState(() => localStorage.getItem(ALERTS_KEY) === "on");
  const [invoice, setInvoice] = useState(null);
  const openingInvoice = useRef(false);
  const knownIds = useRef(null);
  const audioRef = useRef(null);
  const baseTitle = useRef(document.title);

  useEffect(() => {
    document.body.classList.toggle("admin-modal-open", Boolean(invoice));
    return () => document.body.classList.remove("admin-modal-open");
  }, [invoice]);

  async function openInvoice(order) {
    if (openingInvoice.current) return;
    openingInvoice.current = true;
    try {
      const [data, dialog] = await Promise.all([adminFetch("/api/settings/seller"), import("./InvoiceDialog.jsx")]);
      setInvoice({ order, seller: data.seller || {}, Dialog: dialog.InvoiceDialog });
    } catch (error) {
      setNote(
        error.status === 429
          ? "Слишком много неверных попыток. Вход заблокирован на 15 минут."
          : error.status === 401
            ? "Сначала войдите в разделе «Заказы»."
            : "Не удалось загрузить реквизиты."
      );
    } finally {
      openingInvoice.current = false;
    }
  }

  async function load({ silent = false } = {}) {
    if (!silent) setNote("Загружаю заказы…");
    try {
      const data = await adminFetch("/api/orders");
      const next = Array.isArray(data.orders) ? data.orders : [];
      if (knownIds.current) {
        const fresh = next.filter((order) => !knownIds.current.has(order.id) && order.status === "new");
        if (fresh.length && localStorage.getItem(ALERTS_KEY) === "on") notify(fresh);
      }
      knownIds.current = new Set(next.map((order) => order.id));
      setOrders(next);
      setNeedLogin(false);
      if (!silent) setNote("");
      window.dispatchEvent(new Event("gulzat:orders-updated"));
    } catch (error) {
      if (error.status === 401 || error.status === 429) {
        const hadKey = Boolean(adminKey());
        setAdminKey("");
        knownIds.current = null;
        setOrders([]);
        setNeedLogin(true);
        setNote(
          error.status === 429
            ? "Слишком много неверных попыток. Вход заблокирован на 15 минут."
            : hadKey
              ? "Неверный пароль."
              : "Введите пароль, чтобы увидеть заказы."
        );
      } else if (!silent) {
        setNote("Не удалось загрузить заказы. Проверьте, что запущен serve.ps1.");
      }
    }
  }

  function notify(fresh) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      if (!audioRef.current) audioRef.current = new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === "running") {
        const start = ctx.currentTime + 0.02;
        [880, 1318.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const time = start + i * 0.18;
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, time);
          gain.gain.exponentialRampToValueAtTime(0.08, time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(time);
          osc.stop(time + 0.18);
        });
      }
    }
    if ("Notification" in window && Notification.permission === "granted") {
      const first = fresh[0];
      const title = fresh.length === 1 ? `Новый заказ № ${first.number}` : `Новых заказов: ${fresh.length}`;
      const body = fresh.map((order) => `№ ${order.number}`).join(", ");
      new Notification(title, { body, tag: "gulzat-orders" });
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ silent: true }), 30000);
    const onFocus = () => load({ silent: true });
    const onLogout = () => {
      knownIds.current = null;
      setOrders([]);
      setNeedLogin(true);
      setNote("Введите пароль, чтобы увидеть заказы.");
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("gulzat:admin-logout", onLogout);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("gulzat:admin-logout", onLogout);
    };
  }, []);

  const fresh = orders.filter((order) => order.status === "new").length;
  useEffect(() => {
    onBadge?.(fresh);
    document.title = fresh ? `(${fresh}) ${baseTitle.current}` : baseTitle.current;
  }, [fresh, onBadge]);

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const visible = (filter === "all" ? orders : orders.filter((order) => order.status === filter)).filter((order) =>
    q ? matchesQuery(order, q, qDigits) : true
  );

  const counts = { all: orders.length };
  STATUSES.forEach((status) => {
    counts[status.code] = orders.filter((order) => order.status === status.code).length;
  });

  async function updateStatus(id, status, reason = "") {
    try {
      await adminFetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      setOrders((list) =>
        list.map((order) =>
          order.id === id ? { ...order, status, cancelReason: status === "cancel" ? reason : undefined } : order
        )
      );
      setPendingCancel("");
      setNote(`Статус заказа изменён: «${statusLabel(status)}».`);
    } catch {
      setNote("Не удалось изменить статус. Попробуйте ещё раз.");
    }
  }

  async function remove(order) {
    if (!confirm(`Удалить заказ № ${order.number} (${order.name})? Это действие нельзя отменить.`)) return;
    try {
      await adminFetch(`/api/orders/${encodeURIComponent(order.id)}`, { method: "DELETE" });
      setOrders((list) => list.filter((item) => item.id !== order.id));
      setNote("Заказ удалён.");
      window.dispatchEvent(new Event("gulzat:orders-updated"));
    } catch {
      setNote("Не удалось удалить заказ.");
    }
  }

  function exportOrders() {
    if (!visible.length) {
      setNote("Нет заказов для выгрузки.");
      return;
    }
    const columns = [
      { title: "№", width: 7 },
      { title: "Дата", width: 18 },
      { title: "Статус", width: 12 },
      { title: "Клиент", width: 20 },
      { title: "Телефон", width: 18 },
      { title: "Состав заказа", width: 50 },
      { title: "Сумма", width: 12 },
      { title: "Валюта", width: 8 },
      { title: "Откуда", width: 12 },
      { title: "Цвет и пожелания", width: 24 },
      { title: "К дате", width: 12 },
      { title: "Комментарий клиента", width: 40 },
      { title: "Заметка", width: 40 },
      { title: "Причина отмены", width: 30 },
    ];
    const rows = visible.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const sums = {};
      items.forEach((item) => {
        const price = Number(item.price) || 0;
        if (price <= 0) return;
        const code = normalizeCurrency(item.currency);
        sums[code] = (sums[code] || 0) + price * (Number(item.qty) || 1);
      });
      const codes = Object.keys(sums);
      let sum = "по договорённости";
      let currency = "";
      if (codes.length === 1) {
        sum = sums[codes[0]];
        currency = CURRENCIES[codes[0]].symbol;
      } else if (codes.length > 1) {
        sum = orderTotal(order);
        currency = "разные";
      }
      return [
        Number(order.number) || String(order.number || ""),
        formatDate(order.createdAt),
        statusLabel(order.status),
        order.name,
        formatPhone(order.phone),
        items.map((item) => `${item.name} × ${item.qty || 1} — ${linePrice(item)}`).join("; "),
        sum,
        currency,
        order.source === "cart" ? "из корзины" : "из карточки",
        order.color || "",
        formatDueDate(order.dueDate),
        order.comment || "",
        order.note || "",
        order.status === "cancel" ? order.cancelReason || "" : "",
      ];
    });
    const current = STATUSES.find((item) => item.code === filter);
    const suffix = current ? ` (${current.filter})` : "";
    downloadXlsx(`Заказы${suffix} ${exportDateStamp()}.xlsx`, "Заказы", columns, rows);
    setNote(`Скачан файл: заказов в нём ${rows.length}.`);
  }

  async function toggleAlerts() {
    const next = !alerts;
    localStorage.setItem(ALERTS_KEY, next ? "on" : "off");
    setAlerts(next);
    if (next) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        if (!audioRef.current) audioRef.current = new Ctx();
        if (audioRef.current.state === "suspended") await audioRef.current.resume().catch(() => {});
      }
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
    setNote(next ? "Уведомления о новых заказах включены." : "Уведомления выключены.");
  }

  return (
    <section className="admin-list-card orders-card admin-tab" id="orders">
      <div className="admin-sticky-head">
        <div className="orders-head">
          <div>
            <h2>Заказы</h2>
            <p className="admin-lead">
              Сюда автоматически попадает каждый заказ: клиент вводит имя и телефон, после чего переходит в WhatsApp.
            </p>
          </div>
          <div className="admin-head-actions">
            <button type="button" className={`btn${alerts ? "" : " btn-ghost"}`} aria-pressed={alerts} onClick={toggleAlerts}>
              {alerts ? "Уведомления включены" : "Включить уведомления"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportOrders}>
              Скачать в Excel
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => load()}>
              Обновить
            </button>
          </div>
        </div>
        <div className="orders-filters" role="tablist">
          {[{ code: "all", filter: "Все" }, ...STATUSES].map((item) => (
            <button
              type="button"
              key={item.code}
              className={`orders-filter${filter === item.code ? " is-active" : ""}`}
              role="tab"
              aria-selected={filter === item.code}
              onClick={() => setFilter(item.code)}
            >
              {item.filter} <span>{counts[item.code] || 0}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className="clients-search"
          placeholder="Поиск по номеру, имени, телефону, товару или заметке"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <form
        className="orders-login"
        hidden={!needLogin}
        onSubmit={(event) => {
          event.preventDefault();
          setAdminKey(password);
          setPassword("");
          load();
        }}
      >
        <label>
          <span>Пароль админки (ADMIN_PASSWORD из .env)</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button type="submit" className="btn">
          Войти
        </button>
      </form>
      <p className="form-note" role="status">
        {note}
      </p>
      <div className="orders-list">
        {!needLogin && !orders.length ? <p className="admin-empty">Заказов пока нет. Они появятся, когда клиент оформит заказ на сайте.</p> : null}
        {!needLogin && orders.length && !visible.length ? (
          <p className="admin-empty">
            {query.trim()
              ? `По запросу «${query.trim()}» заказов не нашлось.`
              : `Заказов со статусом «${statusLabel(filter)}» нет.`}
          </p>
        ) : null}
        {visible.map((order) => {
          const items = Array.isArray(order.items) ? order.items : [];
          const digits = String(order.phone || "").replace(/\D/g, "");
          const total = orderTotal(order);
          const wishes = [
            ["Цвет и пожелания", order.color],
            ["К дате", formatDueDate(order.dueDate)],
            ["Комментарий", order.comment],
          ].filter(([, value]) => value);
          return (
            <article className={`order-item order-item--${order.status}`} key={order.id}>
              <div className="order-info">
                <div className="order-meta">
                  <strong>№ {order.number}</strong>
                  <span>{formatDate(order.createdAt)}</span>
                  <span>{order.source === "cart" ? "из корзины" : "из карточки"}</span>
                  <span className={`order-badge order-badge--${order.status}`}>{statusLabel(order.status)}</span>
                </div>
                <div className="order-client">
                  <span className="order-client-name">{order.name}</span>
                  <a href={`tel:${order.phone}`}>{formatPhone(order.phone)}</a>
                </div>
                <ul className="order-lines">
                  {items.map((item, index) => (
                    <li key={index}>
                      <span>
                        {item.name} × {item.qty}
                        {item.unverified ? " (нет в каталоге — цену прислал браузер)" : ""}
                      </span>
                      <span>{linePrice(item)}</span>
                    </li>
                  ))}
                </ul>
                {total ? <p className="order-total">Итого: {total}</p> : null}
                {wishes.length ? (
                  <dl className="order-wishes">
                    {wishes.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}:</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {order.stockShort ? (
                  <p className="order-cancel-reason">
                    <span>Склад:</span> заказ пришёл повторной отправкой, когда остатка уже не хватало. Проверьте наличие.
                  </p>
                ) : null}
                {order.status === "cancel" && order.cancelReason ? (
                  <p className="order-cancel-reason">
                    <span>Причина отмены:</span> {order.cancelReason}
                  </p>
                ) : null}
                <NoteField
                  order={order}
                  onSave={(noteText) =>
                    setOrders((list) => list.map((item) => (item.id === order.id ? { ...item, note: noteText } : item)))
                  }
                />
              </div>
              <div className="order-side">
                <label className="order-status-label">
                  <span>Статус</span>
                  <select
                    className="order-status"
                    value={pendingCancel === order.id ? "cancel" : order.status}
                    onChange={(event) => {
                      const status = event.target.value;
                      if (status === "cancel") setPendingCancel(order.id);
                      else updateStatus(order.id, status);
                    }}
                  >
                    {STATUSES.map((status) => (
                      <option key={status.code} value={status.code}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
                {pendingCancel === order.id ? (
                  <form
                    className="order-cancel-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const reason = new FormData(event.currentTarget).get("reason");
                      const text = String(reason || "").trim();
                      if (!text) return;
                      updateStatus(order.id, "cancel", text);
                    }}
                  >
                    <label>
                      <span>Причина отмены</span>
                      <textarea name="reason" rows={2} maxLength={300} required placeholder="Например: клиент передумал, нет в наличии" />
                    </label>
                    <div className="order-cancel-actions">
                      <button type="submit" className="btn btn-danger">
                        Отменить заказ
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setPendingCancel("")}>
                        Назад
                      </button>
                    </div>
                  </form>
                ) : null}
                <div className="order-contact">
                  <button type="button" className="btn btn-ghost" onClick={() => openInvoice(order)}>
                    Счёт PDF
                  </button>
                  <a className="btn btn-ghost" href={clientWhatsAppUrl(order, digits)} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                  <button type="button" className="btn btn-danger" onClick={() => remove(order)}>
                    Удалить
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {invoice?.Dialog ? <InvoiceDialogView invoice={invoice} onClose={() => setInvoice(null)} /> : null}
    </section>
  );
}
