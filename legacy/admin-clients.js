(() => {
  const ADMIN_KEY_STORAGE = "gulzat_admin_key";

  const listEl = document.getElementById("clients-list");
  const noteEl = document.getElementById("clients-note");
  const countEl = document.getElementById("clients-count");
  const searchInput = document.getElementById("clients-search");
  const addBtn = document.getElementById("clients-add");
  const form = document.getElementById("clients-form");
  const nameInput = document.getElementById("client-name");
  const phoneInput = document.getElementById("client-phone");
  const noteInput = document.getElementById("client-note");
  const saveBtn = document.getElementById("client-save");
  const cancelBtn = document.getElementById("client-cancel");
  const exportBtn = document.getElementById("clients-export");
  if (!listEl) return;

  let clients = [];
  let query = "";
  let renderPending = false;
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

  async function api(path = "", options = {}) {
    const headers = {};
    if (options.body) headers["Content-Type"] = "application/json";
    const key = adminKey();
    if (key) headers["X-Admin-Key"] = encodeURIComponent(key);
    const res = await fetch(`/api/clients${path}`, { ...options, headers, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const error = new Error(data.error || `http_${res.status}`);
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function phoneLabel(phone) {
    return typeof formatPhone === "function" ? formatPhone(phone) : phone;
  }

  function ordersWord(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "заказ";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заказа";
    return "заказов";
  }

  function clientHtml(client) {
    const digits = String(client.phone || "").replace(/\D/g, "");
    const count = Number(client.ordersCount) || 0;
    const initial = String(client.name || "?").trim().charAt(0).toUpperCase() || "?";
    const sourceLabel = client.source === "manual" ? "добавлен вручную" : "из заказа";

    return `
      <article class="order-item client-item${count > 1 ? " client-item--repeat" : ""}" data-client-id="${esc(client.id)}">
        <div class="order-info">
          <div class="client-head">
            <span class="client-avatar" aria-hidden="true">${esc(initial)}</span>
            <div class="client-title">
              <span class="order-client-name">${esc(client.name)}</span>
              <a href="tel:${esc(client.phone)}">${esc(phoneLabel(client.phone))}</a>
            </div>
          </div>
          <div class="client-stats">
            <div><span>${count}</span>${ordersWord(count)}</div>
            <div><span>${esc(formatDate(client.lastOrderAt))}</span>последний заказ</div>
          </div>
          <div class="order-meta">
            <span>С нами с ${esc(formatDate(client.createdAt))}</span>
            <span>${sourceLabel}</span>
          </div>
          <label class="client-note-box">
            <span class="client-note-label">Заметка <small data-note-status></small></span>
            <textarea
              class="client-note-input"
              data-client-note="${esc(client.id)}"
              rows="3"
              maxlength="300"
              placeholder="Например: любит бордо, свадьба в мае"
            >${esc(client.note || "")}</textarea>
          </label>
        </div>
        <div class="order-side">
          <div class="order-contact">
            <a class="btn btn-ghost" href="https://wa.me/${digits}" target="_blank" rel="noopener noreferrer">WhatsApp</a>            <button type="button" class="btn btn-danger" data-client-del="${esc(client.id)}">Удалить</button>
          </div>
        </div>
      </article>`;
  }

  function visibleClients() {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    const qDigits = q.replace(/\D/g, "");
    const qDigitsLocal = qDigits.startsWith("8") ? `7${qDigits.slice(1)}` : "";
    return clients.filter((client) => {
      const text = `${client.name} ${client.note || ""}`.toLowerCase();
      const phone = String(client.phone || "").replace(/\D/g, "");
      return (
        text.includes(q) ||
        (qDigits && phone.includes(qDigits)) ||
        (qDigitsLocal && phone.startsWith(qDigitsLocal))
      );
    });
  }

  function exportClients() {
    const list = visibleClients();
    if (!list.length) {
      setNote("Нет клиентов для выгрузки.");
      return;
    }
    if (typeof downloadXlsx !== "function") {
      setNote("Не удалось подготовить файл.");
      return;
    }
    const dateCell = (iso) => {
      const text = formatDate(iso);
      return text === "—" ? "" : text;
    };
    const columns = [
      { title: "Имя", width: 22 },
      { title: "Телефон", width: 18 },
      { title: "Заказов", width: 9 },
      { title: "Последний заказ", width: 16 },
      { title: "С нами с", width: 12 },
      { title: "Откуда", width: 16 },
      { title: "Заметка", width: 45 },
    ];
    const rows = list.map((client) => [
      client.name,
      phoneLabel(client.phone),
      Number(client.ordersCount) || 0,
      dateCell(client.lastOrderAt),
      dateCell(client.createdAt),
      client.source === "manual" ? "добавлен вручную" : "из заказа",
      client.note || "",
    ]);
    downloadXlsx(`Клиенты ${exportDateStamp()}.xlsx`, "Клиенты", columns, rows);
    setNote(`Скачан файл: клиентов в нём ${rows.length}.`);
  }

  function isEditingNote() {
    const active = document.activeElement;
    return active instanceof Element && listEl.contains(active) && active.matches("[data-client-note]");
  }

  function render() {
    if (countEl) countEl.textContent = clients.length ? String(clients.length) : "";
    if (isEditingNote()) {
      renderPending = true;
      return;
    }
    renderPending = false;
    if (!clients.length) {
      listEl.innerHTML = `<p class="admin-empty">Клиентов пока нет. Они появятся после первого заказа или добавьте вручную.</p>`;
      return;
    }
    const visible = visibleClients();
    listEl.innerHTML = visible.length
      ? visible.map(clientHtml).join("")
      : `<p class="admin-empty">По запросу «${esc(query)}» никого не нашлось.</p>`;
  }

  async function loadClients({ silent = false } = {}) {
    try {
      const data = await api();
      clients = Array.isArray(data.clients) ? data.clients : [];
      if (!silent) setNote("");
      render();
    } catch (error) {
      clients = [];
      listEl.innerHTML = "";
      if (countEl) countEl.textContent = "";
      setNote(
        error.status === 401 || error.status === 429
          ? "Войдите в разделе «Заказы», чтобы увидеть клиентов."
          : "Не удалось загрузить клиентов. Проверьте, что запущен serve.ps1."
      );
    }
  }

  function openForm() {
    form.reset();
    saveBtn.textContent = "Добавить";
    form.hidden = false;
    nameInput.focus();
  }

  function closeForm() {
    form.reset();
    form.hidden = true;
  }

  async function saveClient() {
    const body = JSON.stringify({
      name: nameInput.value.trim(),
      phone: phoneInput.value.trim(),
      note: noteInput.value.trim(),
    });
    saveBtn.disabled = true;
    try {
      await api("", { method: "POST", body });
      setNote("Клиент добавлен.");
      closeForm();
      await loadClients({ silent: true });
    } catch (error) {
      if (error.message === "duplicate") {
        const who = error.data?.name ? ` («${error.data.name}»)` : "";
        setNote(`Клиент с этим номером уже есть${who}. Дубль не создан.`);
      } else if (error.message === "bad_phone") {
        setNote("Проверьте номер телефона.");
      } else if (error.message === "bad_name") {
        setNote("Укажите имя клиента.");
      } else if (error.status === 401) {
        setNote("Войдите в разделе «Заказы», чтобы изменять клиентов.");
      } else {
        setNote("Не удалось сохранить клиента.");
      }
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function deleteClient(id) {
    const client = clients.find((item) => item.id === id);
    if (!confirm(`Удалить клиента ${client ? `«${client.name}»` : ""}? Заказы останутся.`)) return;
    try {
      await api(`/${encodeURIComponent(id)}`, { method: "DELETE" });
      clients = clients.filter((item) => item.id !== id);
      render();
      setNote("Клиент удалён.");
    } catch {
      setNote("Не удалось удалить клиента.");
    }
  }

  async function saveClientNote(textarea) {
    const id = textarea.getAttribute("data-client-note");
    clearTimeout(noteTimers.get(id));
    noteTimers.delete(id);
    const client = clients.find((item) => item.id === id);
    if (!client) return;
    const note = textarea.value.trim();
    if (note === (client.note || "")) return;
    const status = textarea.closest(".client-note-box")?.querySelector("[data-note-status]");
    if (status) status.textContent = "сохраняю…";
    try {
      await api(`/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: client.name, phone: client.phone, note }),
      });
      client.note = note;
      if (status) status.textContent = "сохранено";
    } catch (error) {
      if (status) status.textContent = error.status === 401 ? "войдите в «Заказы»" : "не сохранилось";
    }
  }

  addBtn?.addEventListener("click", () => (form.hidden ? openForm() : closeForm()));
  cancelBtn?.addEventListener("click", closeForm);
  exportBtn?.addEventListener("click", exportClients);

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveClient();
  });

  searchInput?.addEventListener("input", () => {
    query = searchInput.value;
    render();
  });

  listEl.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const delBtn = target?.closest("[data-client-del]");
    if (delBtn) deleteClient(delBtn.getAttribute("data-client-del"));
  });

  listEl.addEventListener("input", (event) => {
    const textarea = event.target instanceof Element ? event.target.closest("[data-client-note]") : null;
    if (!textarea) return;
    const id = textarea.getAttribute("data-client-note");
    const status = textarea.closest(".client-note-box")?.querySelector("[data-note-status]");
    if (status) status.textContent = "";
    clearTimeout(noteTimers.get(id));
    noteTimers.set(id, setTimeout(() => saveClientNote(textarea), 1200));
  });

  listEl.addEventListener("focusout", async (event) => {
    const textarea = event.target instanceof Element ? event.target.closest("[data-client-note]") : null;
    if (!textarea) return;
    await saveClientNote(textarea);
    if (renderPending) render();
  });

  window.addEventListener("gulzat:orders-updated", () => loadClients({ silent: true }));

  loadClients();
})();
