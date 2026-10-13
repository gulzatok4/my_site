(() => {
  const STATUSES = [
    { code: "new", label: "Новый", filter: "Новые" },
    { code: "work", label: "В работе", filter: "В работе" },
    { code: "done", label: "Выполнен", filter: "Выполненные" },
    { code: "cancel", label: "Отменён", filter: "Отменённые" },
  ];
  const ADMIN_KEY_STORAGE = "gulzat_admin_key";
  const ALERTS_KEY = "gulzat_order_alerts";
  const REFRESH_MS = 30000;

  const listEl = document.getElementById("orders-list");
  const filtersEl = document.getElementById("orders-filters");
  const noteEl = document.getElementById("orders-note");
  const refreshBtn = document.getElementById("orders-refresh");
  const loginForm = document.getElementById("orders-login");
  const passwordInput = document.getElementById("orders-password");
  const navBadge = document.getElementById("orders-nav-badge");
  const searchInput = document.getElementById("orders-search");
  const exportBtn = document.getElementById("orders-export");
  const alertsBtn = document.getElementById("orders-alerts");
  const logoutBtn = document.getElementById("admin-logout");
  if (!listEl) return;

  const baseTitle = document.title;

  const nav = document.querySelector(".admin-nav");
  if (nav) {
    const syncNavHeight = () =>
      document.documentElement.style.setProperty("--admin-nav-h", `${nav.offsetHeight}px`);
    syncNavHeight();
    new ResizeObserver(syncNavHeight).observe(nav);
  }

  let orders = [];
  let ordersSnapshot = "";
  let activeFilter = "all";
  let loading = false;
  let pendingCancelId = "";
  let query = "";
  let renderPending = false;
  /** null — заказы ещё не загружались, первая загрузка не считается «новыми заказами» */
  let knownIds = null;
  let audioCtx = null;
  const noteTimers = new Map();

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setNote(text) {
    if (noteEl) noteEl.textContent = text;
  }

  function adminKey() {
    try {
      return sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
    } catch {
      return "";
    }
  }

  function setAdminKey(value) {
    try {
      if (value) sessionStorage.setItem(ADMIN_KEY_STORAGE, value);
      else sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    } catch {
      /* ignore */
    }
  }

  async function api(path = "", options = {}) {
    const headers = {};
    if (options.body) headers["Content-Type"] = "application/json";
    const key = adminKey();
    if (key) headers["X-Admin-Key"] = encodeURIComponent(key);
    const res = await fetch(`/api/orders${path}`, { ...options, headers, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 429) {
      const error = new Error(data.error || "unauthorized");
      error.status = res.status;
      throw error;
    }
    if (!res.ok || data.ok === false) throw new Error(data.error || `http_${res.status}`);
    return data;
  }

  function statusLabel(code) {
    return STATUSES.find((item) => item.code === code)?.label || STATUSES[0].label;
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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

  function renderFilters() {
    if (!filtersEl) return;
    const counts = { all: orders.length };
    STATUSES.forEach((status) => {
      counts[status.code] = orders.filter((order) => order.status === status.code).length;
    });
    filtersEl.innerHTML = [{ code: "all", filter: "Все" }, ...STATUSES]
      .map((filter) => {
        const active = filter.code === activeFilter;
        return `<button type="button" class="orders-filter${active ? " is-active" : ""}" data-orders-filter="${filter.code}" role="tab" aria-selected="${active}">${filter.filter} <span>${counts[filter.code]}</span></button>`;
      })
      .join("");
  }

  function renderNavBadge() {
    const fresh = orders.filter((order) => order.status === "new").length;
    document.title = fresh ? `(${fresh}) ${baseTitle}` : baseTitle;
    if (!navBadge) return;
    navBadge.hidden = fresh === 0;
    navBadge.textContent = String(fresh);
  }

  function matchesQuery(order, q, qDigits) {
    const items = (Array.isArray(order.items) ? order.items : []).map((item) => item.name).join(" ");
    const text = [
      order.number,
      order.name,
      items,
      order.color,
      order.comment,
      formatDueDate(order.dueDate),
      order.note,
      order.cancelReason,
    ]
      .map((value) => value || "")
      .join(" ")
      .toLowerCase();
    if (text.includes(q)) return true;
    if (!qDigits) return false;
    const phone = String(order.phone || "").replace(/\D/g, "");
    const local = qDigits.startsWith("8") ? `7${qDigits.slice(1)}` : "";
    return phone.includes(qDigits) || Boolean(local && phone.startsWith(local));
  }

  function visibleOrders() {
    const byStatus = activeFilter === "all" ? orders : orders.filter((order) => order.status === activeFilter);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    const qDigits = q.replace(/\D/g, "");
    return byStatus.filter((order) => matchesQuery(order, q, qDigits));
  }

  function itemsSummary(order) {
    return (Array.isArray(order.items) ? order.items : [])
      .map((item) => `${item.name} × ${item.qty || 1}`)
      .join(", ");
  }

  function alertsOn() {
    try {
      return localStorage.getItem(ALERTS_KEY) === "on";
    } catch {
      return false;
    }
  }

  function renderAlertsBtn() {
    if (!alertsBtn) return;
    const on = alertsOn();
    alertsBtn.textContent = on ? "Уведомления включены" : "Включить уведомления";
    alertsBtn.classList.toggle("btn-ghost", !on);
    alertsBtn.setAttribute("aria-pressed", String(on));
    alertsBtn.title = on
      ? "Нажмите, чтобы выключить звук и уведомления о новых заказах"
      : "Звук и уведомление в углу экрана, когда приходит новый заказ";
  }

  /** Браузер разрешает звук только после нажатия на странице */
  function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return Promise.resolve();
    if (!audioCtx) audioCtx = new Ctx();
    return audioCtx.state === "suspended" ? audioCtx.resume().catch(() => {}) : Promise.resolve();
  }

  function playChime() {
    if (!audioCtx || audioCtx.state !== "running") return;
    const start = audioCtx.currentTime + 0.02;
    [880, 1318.5].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = start + i * 0.18;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  function showSystemNotification(fresh) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const first = fresh[0];
    const title = fresh.length === 1 ? `Новый заказ № ${first.number}` : `Новых заказов: ${fresh.length}`;
    const body =
      fresh.length === 1
        ? `${first.name}: ${itemsSummary(first)}`
        : fresh.map((order) => `№ ${order.number} — ${order.name}`).join("\n");
    try {
      const notification = new Notification(title, { body, tag: "gulzat-orders", renotify: true, icon: "./favicon.svg" });
      notification.onclick = () => {
        window.focus();
        location.hash = "orders";
        notification.close();
      };
    } catch {
      /* ignore */
    }
  }

  function notifyNewOrders(fresh) {
    const numbers = fresh.map((order) => `№ ${order.number}`).join(", ");
    setNote(fresh.length === 1 ? `Новый заказ ${numbers}.` : `Новые заказы: ${numbers}.`);
    if (!alertsOn()) return;
    playChime();
    showSystemNotification(fresh);
  }

  function notificationsHint() {
    if (!("Notification" in window)) return "Звук включён. Этот браузер не умеет показывать уведомления.";
    if (Notification.permission === "denied") {
      return "Звук включён, но уведомления заблокированы в браузере. Разрешите их для этого сайта (значок слева от адреса).";
    }
    if (Notification.permission === "granted") {
      return "Уведомления включены: при новом заказе прозвучит сигнал и появится окошко в углу экрана. Держите вкладку админки открытой.";
    }
    return "Звук включён. Чтобы видеть окошко в углу экрана, разрешите уведомления в запросе браузера.";
  }

  function toggleAlerts() {
    const next = !alertsOn();
    try {
      localStorage.setItem(ALERTS_KEY, next ? "on" : "off");
    } catch {
      /* ignore */
    }
    renderAlertsBtn();
    if (!next) {
      setNote("Уведомления о новых заказах выключены.");
      return;
    }
    unlockAudio().then(playChime);
    if ("Notification" in window && Notification.permission === "default") {
      setNote(notificationsHint());
      Notification.requestPermission().then(() => setNote(notificationsHint()));
    } else {
      setNote(notificationsHint());
    }
  }

  function exportOrders() {
    const list = visibleOrders();
    if (!list.length) {
      setNote("Нет заказов для выгрузки.");
      return;
    }
    if (typeof downloadXlsx !== "function") {
      setNote("Не удалось подготовить файл.");
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
    const rows = list.map((order) => {
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
    const filter = STATUSES.find((item) => item.code === activeFilter);
    const suffix = filter ? ` (${filter.filter})` : "";
    downloadXlsx(`Заказы${suffix} ${exportDateStamp()}.xlsx`, "Заказы", columns, rows);
    setNote(`Скачан файл: заказов в нём ${rows.length}.`);
  }

  function isEditingNote() {
    const active = document.activeElement;
    return active instanceof Element && listEl.contains(active) && active.matches("[data-order-note]");
  }

  async function saveOrderNote(textarea) {
    const id = textarea.getAttribute("data-order-note");
    clearTimeout(noteTimers.get(id));
    noteTimers.delete(id);
    const order = orders.find((item) => item.id === id);
    if (!order) return;
    const note = textarea.value.trim();
    if (note === (order.note || "")) return;
    const status = textarea.closest(".client-note-box")?.querySelector("[data-note-status]");
    if (status) status.textContent = "сохраняю…";
    try {
      await api(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ note }) });
      order.note = note;
      if (status) status.textContent = "сохранено";
    } catch (error) {
      if (status) status.textContent = error.status === 401 ? "войдите заново" : "не сохранилось";
    }
  }

  function clientWhatsAppUrl(order, digits) {
    const items = Array.isArray(order.items) ? order.items : [];
    const name = String(order.name || "").trim();
    const lines = [name ? `Здравствуйте, ${name}!` : "Здравствуйте!"];
    if (items.length === 1) {
      lines.push(`Вы хотели заказать у нас «${items[0].name}» × ${items[0].qty || 1}.`);
    } else if (items.length > 1) {
      lines.push("Вы хотели заказать у нас:");
      items.forEach((item) => lines.push(`— ${item.name} × ${item.qty || 1}`));
    } else {
      lines.push("Вы хотели сделать у нас заказ.");
    }
    const total = orderTotal(order);
    if (total) lines.push(`Итого: ${total}`);
    return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  function wishesHtml(order) {
    const rows = [
      ["Цвет и пожелания", order.color],
      ["К дате", formatDueDate(order.dueDate)],
      ["Комментарий", order.comment],
    ].filter(([, value]) => value);
    if (!rows.length) return "";
    return `<dl class="order-wishes">${rows
      .map(([label, value]) => `<div><dt>${label}:</dt><dd>${esc(value)}</dd></div>`)
      .join("")}</dl>`;
  }

  function orderHtml(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const digits = String(order.phone || "").replace(/\D/g, "");
    const total = orderTotal(order);
    const cancelPending = pendingCancelId === order.id;
    const selectedStatus = cancelPending ? "cancel" : order.status;
    const statusOptions = STATUSES.map(
      (status) =>
        `<option value="${status.code}"${status.code === selectedStatus ? " selected" : ""}>${status.label}</option>`
    ).join("");
    const cancelForm = cancelPending
      ? `<form class="order-cancel-form" data-order-cancel-form="${esc(order.id)}">
            <label>
              <span>Причина отмены</span>
              <textarea name="reason" rows="2" maxlength="300" required placeholder="Например: клиент передумал, нет в наличии"></textarea>
            </label>
            <div class="order-cancel-actions">
              <button type="submit" class="btn btn-danger">Отменить заказ</button>
              <button type="button" class="btn btn-ghost" data-order-cancel-back>Назад</button>
            </div>
          </form>`
      : "";

    return `
      <article class="order-item order-item--${esc(order.status)}" data-order-id="${esc(order.id)}">
        <div class="order-info">
          <div class="order-meta">
            <strong>№ ${esc(order.number)}</strong>
            <span>${esc(formatDate(order.createdAt))}</span>
            <span>${order.source === "cart" ? "из корзины" : "из карточки"}</span>
            <span class="order-badge order-badge--${esc(order.status)}">${esc(statusLabel(order.status))}</span>
          </div>
          <div class="order-client">
            <span class="order-client-name">${esc(order.name)}</span>
            <a href="tel:${esc(order.phone)}">${esc(formatPhone(order.phone))}</a>
          </div>
          <ul class="order-lines">
            ${items
              .map(
                (item) =>
                  `<li><span>${esc(item.name)} × ${esc(item.qty)}</span><span>${esc(linePrice(item))}</span></li>`
              )
              .join("")}
          </ul>
          ${total ? `<p class="order-total">Итого: ${esc(total)}</p>` : ""}
          ${wishesHtml(order)}
          ${
            order.status === "cancel" && order.cancelReason
              ? `<p class="order-cancel-reason"><span>Причина отмены:</span> ${esc(order.cancelReason)}</p>`
              : ""
          }
          <label class="client-note-box">
            <span class="client-note-label">Заметка <small data-note-status></small></span>
            <textarea
              class="client-note-input"
              data-order-note="${esc(order.id)}"
              rows="2"
              maxlength="1000"
              placeholder="Например: цвет бордо, к 15 ноября, предоплата 50%"
            >${esc(order.note || "")}</textarea>
          </label>
        </div>
        <div class="order-side">
          <label class="order-status-label">
            <span>Статус</span>
            <select class="order-status" data-order-status="${esc(order.id)}">${statusOptions}</select>
          </label>
          ${cancelForm}
          <div class="order-contact">
            <a class="btn btn-ghost" href="${esc(clientWhatsAppUrl(order, digits))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>            <button type="button" class="btn btn-danger" data-order-del="${esc(order.id)}">Удалить</button>
          </div>
        </div>
      </article>`;
  }

  function render() {
    renderFilters();
    renderNavBadge();
    if (isEditingNote()) {
      renderPending = true;
      return;
    }
    renderPending = false;
    if (!orders.length) {
      listEl.innerHTML = `<p class="admin-empty">Заказов пока нет. Они появятся, когда клиент оформит заказ на сайте.</p>`;
      return;
    }
    const visible = visibleOrders();
    let empty = `Заказов со статусом «${esc(statusLabel(activeFilter))}» нет.`;
    if (query.trim()) empty = `По запросу «${esc(query.trim())}» заказов не нашлось.`;
    listEl.innerHTML = visible.length
      ? visible.map(orderHtml).join("")
      : `<p class="admin-empty">${empty}</p>`;
  }

  async function loadOrders({ silent = false } = {}) {
    if (loading) return;
    loading = true;
    if (!silent) setNote("Загружаю заказы…");
    try {
      const data = await api();
      const next = Array.isArray(data.orders) ? data.orders : [];
      const snapshot = JSON.stringify(next);
      if (loginForm) loginForm.hidden = true;
      if (logoutBtn) logoutBtn.hidden = !adminKey();
      if (!silent) setNote("");
      if (knownIds) {
        const fresh = next.filter((order) => !knownIds.has(order.id));
        if (fresh.length) notifyNewOrders(fresh);
      }
      knownIds = new Set(next.map((order) => order.id));
      if (snapshot !== ordersSnapshot || !silent) {
        orders = next;
        ordersSnapshot = snapshot;
        render();
        window.dispatchEvent(new Event("gulzat:orders-updated"));
      }
    } catch (error) {
      if (error.status === 401 || error.status === 429) {
        const hadKey = Boolean(adminKey());
        setAdminKey("");
        knownIds = null;
        orders = [];
        ordersSnapshot = "";
        listEl.innerHTML = "";
        if (filtersEl) filtersEl.innerHTML = "";
        renderNavBadge();
        if (loginForm) loginForm.hidden = false;
        if (logoutBtn) logoutBtn.hidden = true;
        if (error.status === 429) {
          setNote("Слишком много неверных попыток. Вход заблокирован на 15 минут.");
        } else {
          setNote(hadKey ? "Неверный пароль." : "Введите пароль, чтобы увидеть заказы.");
        }
      } else if (!silent) {
        setNote(
          location.protocol === "file:"
            ? "Заказы доступны только через сервер: запустите serve.ps1 и откройте http://127.0.0.1:8765/admin.html"
            : "Не удалось загрузить заказы. Проверьте, что запущен serve.ps1."
        );
      }
    } finally {
      loading = false;
    }
  }

  async function updateStatus(id, status, reason = "") {
    try {
      await api(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
      const order = orders.find((item) => item.id === id);
      if (order) {
        order.status = status;
        if (status === "cancel") order.cancelReason = reason;
        else delete order.cancelReason;
      }
      if (pendingCancelId === id) pendingCancelId = "";
      ordersSnapshot = JSON.stringify(orders);
      render();
      setNote(`Статус заказа изменён: «${statusLabel(status)}».`);
    } catch {
      setNote("Не удалось изменить статус. Попробуйте ещё раз.");
      if (!pendingCancelId) loadOrders({ silent: true });
    }
  }

  function startCancel(id) {
    pendingCancelId = id;
    render();
    listEl.querySelector(`[data-order-cancel-form="${CSS.escape(id)}"] textarea`)?.focus();
  }

  async function deleteOrder(id) {
    const order = orders.find((item) => item.id === id);
    const label = order ? `№ ${order.number} (${order.name})` : "";
    if (!confirm(`Удалить заказ ${label}? Это действие нельзя отменить.`)) return;
    try {
      await api(`/${encodeURIComponent(id)}`, { method: "DELETE" });
      orders = orders.filter((item) => item.id !== id);
      ordersSnapshot = JSON.stringify(orders);
      render();
      window.dispatchEvent(new Event("gulzat:orders-updated"));
      setNote("Заказ удалён.");
    } catch {
      setNote("Не удалось удалить заказ.");
    }
  }

  filtersEl?.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-orders-filter]") : null;
    if (!btn) return;
    activeFilter = btn.getAttribute("data-orders-filter") || "all";
    render();
  });

  listEl.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.hasAttribute("data-order-status")) return;
    const id = select.getAttribute("data-order-status");
    if (select.value === "cancel") {
      startCancel(id);
      return;
    }
    if (pendingCancelId === id) pendingCancelId = "";
    updateStatus(id, select.value);
  });

  listEl.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-order-cancel-form")) return;
    event.preventDefault();
    const field = form.elements.namedItem("reason");
    const reason = field instanceof HTMLTextAreaElement ? field.value.trim() : "";
    if (!reason) {
      setNote("Укажите причину отмены.");
      field?.focus();
      return;
    }
    updateStatus(form.getAttribute("data-order-cancel-form"), "cancel", reason);
  });

  listEl.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-order-cancel-back]")) {
      pendingCancelId = "";
      render();
      return;
    }
    const btn = target?.closest("[data-order-del]");
    if (!btn) return;
    deleteOrder(btn.getAttribute("data-order-del"));
  });

  listEl.addEventListener("input", (event) => {
    const textarea = event.target instanceof Element ? event.target.closest("[data-order-note]") : null;
    if (!textarea) return;
    const id = textarea.getAttribute("data-order-note");
    const status = textarea.closest(".client-note-box")?.querySelector("[data-note-status]");
    if (status) status.textContent = "";
    clearTimeout(noteTimers.get(id));
    noteTimers.set(id, setTimeout(() => saveOrderNote(textarea), 1200));
  });

  listEl.addEventListener("focusout", async (event) => {
    const textarea = event.target instanceof Element ? event.target.closest("[data-order-note]") : null;
    if (!textarea) return;
    await saveOrderNote(textarea);
    if (renderPending && !isEditingNote()) render();
  });

  searchInput?.addEventListener("input", () => {
    query = searchInput.value;
    render();
  });

  logoutBtn?.addEventListener("click", () => {
    setAdminKey("");
    location.reload();
  });

  refreshBtn?.addEventListener("click", () => loadOrders());
  exportBtn?.addEventListener("click", exportOrders);
  alertsBtn?.addEventListener("click", toggleAlerts);

  ["pointerdown", "keydown"].forEach((type) => {
    document.addEventListener(type, () => {
      if (alertsOn()) unlockAudio();
    }, { capture: true });
  });

  loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = passwordInput?.value || "";
    if (!value) return;
    setAdminKey(value);
    if (passwordInput) passwordInput.value = "";
    loadOrders();
  });

  // Опрос идёт и в фоновой вкладке, иначе уведомление о новом заказе не придёт
  window.setInterval(() => {
    if (pendingCancelId || (loginForm && !loginForm.hidden)) return;
    loadOrders({ silent: true });
  }, REFRESH_MS);

  renderAlertsBtn();

  window.addEventListener("focus", () => {
    if (pendingCancelId || (loginForm && !loginForm.hidden)) return;
    loadOrders({ silent: true });
  });

  loadOrders();
})();
