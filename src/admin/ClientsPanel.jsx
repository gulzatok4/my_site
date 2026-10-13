import { useEffect, useRef, useState } from "react";
import { formatPhone } from "../lib/catalog.js";
import { adminFetch } from "../lib/adminSession.js";
import { downloadXlsx, exportDateStamp } from "../lib/xlsx.js";

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

function ordersWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заказ";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заказа";
  return "заказов";
}

function NoteField({ client, onSave }) {
  const [value, setValue] = useState(client.note || "");
  const [status, setStatus] = useState("");
  const timer = useRef(0);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setValue(client.note || "");
  }, [client.note, client.id]);

  async function save(next) {
    const note = next.trim();
    if (note === (client.note || "")) return;
    setStatus("сохраняю…");
    try {
      await adminFetch(`/api/clients/${encodeURIComponent(client.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ note }),
      });
      onSave(note);
      setStatus("сохранено");
    } catch (error) {
      setStatus(error.status === 401 ? "войдите в «Заказы»" : "не сохранилось");
    }
  }

  return (
    <label className="client-note-box">
      <span className="client-note-label">
        Заметка <small>{status}</small>
      </span>
      <textarea
        className="client-note-input"
        rows={3}
        maxLength={300}
        placeholder="Например: любит бордо, свадьба в мае"
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

export function ClientsPanel() {
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [clientNote, setClientNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load({ silent = false } = {}) {
    try {
      const data = await adminFetch("/api/clients");
      setClients(Array.isArray(data.clients) ? data.clients : []);
      if (!silent) setNote("");
    } catch (error) {
      setClients([]);
      setNote(
        error.status === 401 || error.status === 429
          ? "Войдите в разделе «Заказы», чтобы увидеть клиентов."
          : "Не удалось загрузить клиентов. Проверьте, что запущен serve.ps1."
      );
    }
  }

  useEffect(() => {
    load();
    const onOrders = () => load({ silent: true });
    const onLogout = () => {
      setClients([]);
      setNote("Войдите в разделе «Заказы», чтобы увидеть клиентов.");
    };
    window.addEventListener("gulzat:orders-updated", onOrders);
    window.addEventListener("gulzat:admin-logout", onLogout);
    return () => {
      window.removeEventListener("gulzat:orders-updated", onOrders);
      window.removeEventListener("gulzat:admin-logout", onLogout);
    };
  }, []);

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const qDigitsLocal = qDigits.startsWith("8") ? `7${qDigits.slice(1)}` : "";
  const visible = clients.filter((client) => {
    if (!q) return true;
    const text = `${client.name} ${client.note || ""}`.toLowerCase();
    const digits = String(client.phone || "").replace(/\D/g, "");
    return text.includes(q) || (qDigits && digits.includes(qDigits)) || (qDigitsLocal && digits.startsWith(qDigitsLocal));
  });

  async function saveClient(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await adminFetch("/api/clients", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), note: clientNote.trim() }),
      });
      setNote("Клиент добавлен.");
      setFormOpen(false);
      setName("");
      setPhone("");
      setClientNote("");
      await load({ silent: true });
    } catch (error) {
      if (error.message === "duplicate") {
        const who = error.data?.name ? ` («${error.data.name}»)` : "";
        setNote(`Клиент с этим номером уже есть${who}. Дубль не создан.`);
      } else if (error.message === "bad_phone") setNote("Проверьте номер телефона.");
      else if (error.message === "bad_name") setNote("Укажите имя клиента.");
      else if (error.status === 401) setNote("Войдите в разделе «Заказы», чтобы изменять клиентов.");
      else setNote("Не удалось сохранить клиента.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(client) {
    if (!confirm(`Удалить клиента «${client.name}»? Заказы останутся.`)) return;
    try {
      await adminFetch(`/api/clients/${encodeURIComponent(client.id)}`, { method: "DELETE" });
      setClients((list) => list.filter((item) => item.id !== client.id));
      setNote("Клиент удалён.");
    } catch {
      setNote("Не удалось удалить клиента.");
    }
  }

  function exportClients() {
    if (!visible.length) {
      setNote("Нет клиентов для выгрузки.");
      return;
    }
    const dateCell = (iso) => {
      const text = formatDate(iso);
      return text === "—" ? "" : text;
    };
    downloadXlsx(`Клиенты ${exportDateStamp()}.xlsx`, "Клиенты", [
      { title: "Имя", width: 22 },
      { title: "Телефон", width: 18 },
      { title: "Заказов", width: 9 },
      { title: "Последний заказ", width: 16 },
      { title: "С нами с", width: 12 },
      { title: "Откуда", width: 16 },
      { title: "Заметка", width: 45 },
    ], visible.map((client) => [
      client.name,
      formatPhone(client.phone),
      Number(client.ordersCount) || 0,
      dateCell(client.lastOrderAt),
      dateCell(client.createdAt),
      client.source === "manual" ? "добавлен вручную" : "из заказа",
      client.note || "",
    ]));
    setNote(`Скачан файл: клиентов в нём ${visible.length}.`);
  }

  return (
    <section className="admin-list-card clients-card admin-tab" id="clients">
      <div className="admin-sticky-head">
        <div className="orders-head">
          <div>
            <h2>
              Клиенты <span className="clients-count">{clients.length ? clients.length : ""}</span>
            </h2>
            <p className="admin-lead">
              Один номер телефона — один клиент. Клиенты из заказов сохраняются автоматически, повторный заказ не создаёт дубль.
            </p>
          </div>
          <div className="admin-head-actions">
            <button type="button" className="btn btn-ghost" onClick={exportClients}>
              Скачать в Excel
            </button>
            <button type="button" className="btn" onClick={() => setFormOpen((open) => !open)}>
              Добавить клиента
            </button>
          </div>
        </div>
        <input
          type="search"
          className="clients-search"
          placeholder="Поиск по имени, телефону или заметке"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <form className="clients-form" hidden={!formOpen} onSubmit={saveClient}>
        <label>
          <span>Имя</span>
          <input type="text" maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>Телефон</span>
          <input type="tel" placeholder="+7 7__ ___ __ __" required value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="clients-form-wide">
          <span>Заметка</span>
          <input
            type="text"
            maxLength={300}
            placeholder="Например: любит бордо, свадьба в мае"
            value={clientNote}
            onChange={(event) => setClientNote(event.target.value)}
          />
        </label>
        <div className="clients-form-actions">
          <button type="submit" className="btn" disabled={busy}>
            Сохранить
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setFormOpen(false);
              setName("");
              setPhone("");
              setClientNote("");
            }}
          >
            Отмена
          </button>
        </div>
      </form>
      <p className="form-note" role="status">
        {note}
      </p>
      <div className="orders-list clients-list">
        {!clients.length ? <p className="admin-empty">Клиентов пока нет. Они появятся после первого заказа или добавьте вручную.</p> : null}
        {clients.length && !visible.length ? <p className="admin-empty">Никого не нашлось.</p> : null}
        {visible.map((client) => {
          const count = Number(client.ordersCount) || 0;
          const initial = String(client.name || "?").trim().charAt(0).toUpperCase() || "?";
          const digits = String(client.phone || "").replace(/\D/g, "");
          return (
            <article className={`order-item client-item${count > 1 ? " client-item--repeat" : ""}`} key={client.id}>
              <div className="order-info">
                <div className="client-head">
                  <span className="client-avatar" aria-hidden="true">
                    {initial}
                  </span>
                  <div className="client-title">
                    <span className="order-client-name">{client.name}</span>
                    <a href={`tel:${client.phone}`}>{formatPhone(client.phone)}</a>
                  </div>
                </div>
                <div className="client-stats">
                  <div>
                    <span>{count}</span>
                    {ordersWord(count)}
                  </div>
                  <div>
                    <span>{formatDate(client.lastOrderAt)}</span>последний заказ
                  </div>
                </div>
                <div className="order-meta">
                  <span>С нами с {formatDate(client.createdAt)}</span>
                  <span>{client.source === "manual" ? "добавлен вручную" : "из заказа"}</span>
                </div>
                <NoteField
                  client={client}
                  onSave={(text) => setClients((list) => list.map((item) => (item.id === client.id ? { ...item, note: text } : item)))}
                />
              </div>
              <div className="order-side">
                <div className="order-contact">
                  <a className="btn btn-ghost" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                  <button type="button" className="btn btn-danger" onClick={() => remove(client)}>
                    Удалить
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
