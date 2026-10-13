import { useEffect, useRef, useState } from "react";
import { askAssistant, linkParts, NAME } from "../ai/index.js";
import { getCartLines, loadProducts, saveCartWishes, setCartQty } from "../lib/catalog.js";
import { CHAT_DOC_LIMIT, CHAT_IMAGE_LIMIT, CHAT_PAYLOAD_LIMIT, fileKind, prepareChatFile } from "../lib/media.js";
import { useStore } from "../store.jsx";

const HISTORY_KEY = "gulzat-chat-history-v2";
const HISTORY_LIMIT = 100;
const SIZE_KEY = "gulzat-chat-size";
const EMOJIS = [
  "😀", "😊", "😂", "😍", "😘", "😉", "😎", "🤔",
  "😅", "🥰", "🤗", "👋", "👍", "👏", "🙏", "❤️",
  "💕", "🌸", "🌹", "💐", "🎉", "✨", "⭐", "✅",
  "💬", "📷", "📎", "👰", "💍", "🎁", "🧺", "💻",
];

function RichText({ text }) {
  const parts = linkParts(text);
  return (
    <div className="ai-chat-bubble-text">
      {parts.map((part, index) => (
        typeof part === "string" ? part : (
          <a
            key={index}
            className="ai-chat-link"
            href={part.href}
            target={part.href.startsWith("tel:") ? "_self" : "_blank"}
            rel="noopener noreferrer"
          >
            {part.label}
          </a>
        )
      ))}
    </div>
  );
}

/** Ответ, который не успел прийти до перезагрузки страницы, уже не придёт — его заглушку «…» не показываем */
function isStalePlaceholder(item) {
  return item.pending || (item.role === "bot" && item.text === "…");
}

function loadThread() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item === "object" && !isStalePlaceholder(item)) : [];
  } catch {
    return [];
  }
}

function apiHistory(thread) {
  return thread
    .map((item) => ({
      role: item.role === "user" ? "user" : "assistant",
      content: String(item.text || "").replace(/^\[файл:\s*.*\]\s*$/i, "").trim(),
    }))
    .filter((item) => item.content);
}

function persistThread(thread) {
  const recent = thread.slice(-HISTORY_LIMIT);
  const slim = (previewCount) =>
    recent.map((item, index) => ({
      role: item.role,
      text: item.text || "",
      files: (item.files || []).map((file) => ({
        kind: file.kind,
        name: file.name || "",
        preview:
          index >= recent.length - previewCount &&
          file.kind === "image" &&
          String(file.preview || "").startsWith("data:image/")
            ? file.preview
            : "",
      })),
      ...(item.cart?.length ? { cart: item.cart } : {}),
      ...(item.pending ? { pending: true } : {}),
    }));
  for (const previewCount of [HISTORY_LIMIT, 10, 0]) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(slim(previewCount)));
      return;
    } catch {
      /* quota: retry with fewer photo previews */
    }
  }
}

/** Кладёт в корзину позиции, которые ассистент собрал в готовый заказ; возвращает то, что реально попало в корзину */
function applyChatCart(items) {
  const added = [];
  const colors = [];
  const comments = [];
  let dueDate = "";
  for (const item of items) {
    const id = String(item?.id || "");
    const qty = Math.min(99, Math.max(1, Number(item?.qty) || 1));
    if (!id || !loadProducts().some((product) => product.id === id)) continue;
    setCartQty(id, qty);
    const line = getCartLines().find((entry) => entry.product.id === id);
    if (!line) continue;
    const name = line.product.name || String(item.name || "");
    added.push({ name, qty: line.qty });
    const color = String(item.color || "").trim();
    const comment = String(item.comment || "").trim();
    if (color) colors.push({ name, text: color });
    if (comment) comments.push({ name, text: comment });
    if (!dueDate && item.dueDate) dueDate = String(item.dueDate);
  }
  const joinNotes = (notes) =>
    notes.length > 1 ? notes.map((note) => `${note.name}: ${note.text}`).join("; ") : notes[0]?.text || "";
  if (added.length) saveCartWishes({ color: joinNotes(colors), dueDate, comment: joinNotes(comments) });
  return added;
}

export function ChatWidget() {
  const { openCart } = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState([]);
  const [messages, setMessages] = useState(loadThread);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const sendingRef = useRef(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const rootRef = useRef(null);
  const photoRef = useRef(null);
  const fileRef = useRef(null);
  const historyRef = useRef(apiHistory(loadThread()));

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    function onStorage(event) {
      if (event.key !== HISTORY_KEY || sendingRef.current) return;
      const next = loadThread();
      setMessages(next);
      historyRef.current = apiHistory(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    try {
      const saved = JSON.parse(localStorage.getItem(SIZE_KEY) || "null");
      if (saved?.w) panel.style.width = `${saved.w}px`;
      if (saved?.h) {
        panel.style.height = `${saved.h}px`;
        panel.style.maxHeight = `${saved.h}px`;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key !== "Escape" || !open) return;
      if (emojiOpen || attachOpen) {
        event.stopPropagation();
        setEmojiOpen(false);
        setAttachOpen(false);
        return;
      }
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, emojiOpen, attachOpen]);

  function remember(next) {
    setMessages(next);
    persistThread(next);
  }

  async function addFiles(list) {
    const files = Array.from(list || []);
    const next = [...pending];
    let payload = next.reduce((sum, item) => sum + String(item.dataUrl || "").length, 0);
    for (const file of files) {
      if (!file) continue;
      if (next.length >= 4) {
        setNotice("За раз можно прикрепить до 4 файлов.");
        break;
      }
      const kind = fileKind(file);
      if (kind === "image" && file.size > CHAT_IMAGE_LIMIT) {
        setNotice("Фото больше 8 МБ — выберите файл поменьше.");
        continue;
      }
      if (kind !== "image" && kind !== "video" && file.size > CHAT_DOC_LIMIT) {
        setNotice("Документ больше 5 МБ — отправьте файл поменьше или опишите словами, что в нём.");
        continue;
      }
      let item;
      try {
        item = await prepareChatFile(file);
      } catch {
        item = { kind: "file", name: file.name || "файл", type: file.type || "", preview: "", dataUrl: "", text: "" };
      }
      const size = String(item.dataUrl || "").length;
      if (payload + size > CHAT_PAYLOAD_LIMIT) {
        setNotice("Файлы слишком большие для одного сообщения — отправьте часть следующим.");
        continue;
      }
      payload += size;
      next.push(item);
    }
    setPending(next);
  }

  async function send(raw) {
    const text = String(raw ?? draft).trim();
    if (sendingRef.current || (!text && !pending.length)) return;
    sendingRef.current = true;
    setSending(true);
    setNotice("");
    setEmojiOpen(false);
    setAttachOpen(false);
    const files = pending;
    setPending([]);
    setDraft("");
    const previous = historyRef.current.slice(-12);
    const apiText = text || files.map((file) => `[${file.kind === "image" ? "фото" : "файл"}: ${file.name}]`).join(" ");
    const userMsg = { role: "user", text, files };
    const withUser = [...messages, userMsg, { role: "bot", text: "…", files: [], pending: true }];
    remember(withUser);
    const userEntry = apiText ? { role: "user", content: apiText } : null;
    if (userEntry) historyRef.current.push(userEntry);
    const attachments = files.map((file) => ({
      kind: file.kind,
      name: file.name,
      type: file.type || "",
      dataUrl: file.dataUrl || "",
      text: file.text || "",
    }));
    try {
      const { reply, files: parsed, cart } = await askAssistant({ message: text, history: previous, attachments, files });
      const digest = parsed
        .filter((file) => file && file.text)
        .map((file) => `[Файл «${file.name}»]\n${file.text}`)
        .join("\n\n");
      if (userEntry && digest) userEntry.content = `${userEntry.content}\n\n${digest}`;
      historyRef.current.push({ role: "assistant", content: reply });
      const added = applyChatCart(cart || []);
      const botMsg = { role: "bot", text: reply, files: [], ...(added.length ? { cart: added } : {}) };
      remember([...withUser.slice(0, -1), botMsg]);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function bindResize(event, axes) {
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!panel || !root) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = panel.getBoundingClientRect();
    root.classList.add("is-resizing");
    const onMove = (moveEvent) => {
      const maxW = Math.max(300, window.innerWidth - 24);
      const maxH = Math.max(360, window.innerHeight - 80);
      if (axes.x) panel.style.width = `${Math.round(Math.min(maxW, Math.max(300, rect.width + (startX - moveEvent.clientX))))}px`;
      if (axes.y) {
        const next = Math.round(Math.min(maxH, Math.max(360, rect.height + (startY - moveEvent.clientY))));
        panel.style.height = `${next}px`;
        panel.style.maxHeight = `${next}px`;
      }
    };
    const onUp = () => {
      root.classList.remove("is-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const next = panel.getBoundingClientRect();
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify({ w: next.width, h: next.height }));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function openChat() {
    setOpen(true);
    if (!messages.length) {
      const hello = `Здравствуйте! Я ${NAME}, консультант. Подскажу по услугам, товарам и заказу. Можно прикрепить фото или файл.`;
      const next = [{ role: "bot", text: hello, files: [] }];
      remember(next);
      historyRef.current = [{ role: "assistant", content: hello }];
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className={`ai-chat${open ? " is-open" : ""}`} id="ai-chat" ref={rootRef}>
      <button
        type="button"
        className="ai-chat-toggle"
        aria-expanded={open}
        aria-controls="ai-chat-panel"
        title={`консультант ${NAME}`}
        hidden={open}
        onClick={() => (open ? setOpen(false) : openChat())}
      >
        <span className="ai-chat-toggle-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4v2h12V8H6zm0 4v2h8v-2H6z" />
          </svg>
        </span>
        <span className="ai-chat-toggle-label">Спросить {NAME}</span>
      </button>
      <div
        className="ai-chat-panel"
        id="ai-chat-panel"
        role="dialog"
        aria-label={`Чат с ${NAME}`}
        hidden={!open}
        ref={panelRef}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
        }}
      >
        <div className="ai-chat-head">
          <div className="ai-chat-avatar" aria-hidden="true">А</div>
          <div className="ai-chat-head-text">
            <strong>{NAME}</strong>
            <span>AI консультант</span>
          </div>
          <button type="button" className="ai-chat-close" aria-label="Закрыть чат" title="Закрыть" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="ai-chat-messages" ref={listRef}>
          {messages.map((item, index) => (
            <div className={`ai-chat-row ai-chat-row--${item.role === "user" ? "user" : "bot"}`} key={`${item.role}-${index}`}>
              <div className="ai-chat-bubble">
                {item.files?.length ? (
                  <div className="ai-chat-media">
                    {item.files.map((file, fileIndex) =>
                      file.kind === "image" && file.preview ? (
                        <img className="ai-chat-thumb" alt={file.name || "изображение"} src={file.preview} key={fileIndex} />
                      ) : (
                        <div className="ai-chat-file-chip" key={fileIndex}>
                          {file.name || "файл"}
                        </div>
                      )
                    )}
                  </div>
                ) : null}
                {item.text ? <RichText text={item.text} /> : <div className="ai-chat-bubble-text" />}
                {item.cart?.length ? (
                  <div className="ai-chat-cart">
                    <strong className="ai-chat-cart-title">Добавлено в корзину</strong>
                    <ul className="ai-chat-cart-list">
                      {item.cart.map((line, lineIndex) => (
                        <li key={lineIndex}>
                          {line.name} × {line.qty}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="ai-chat-cart-open"
                      onClick={() => {
                        setOpen(false);
                        openCart();
                      }}
                    >
                      Открыть корзину
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <form
          className="ai-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <p className="form-note" role="status" hidden={!notice}>{notice}</p>
          <div className="ai-chat-pending" hidden={!pending.length}>
            {pending.map((file, index) => (
              <div className="ai-chat-pending-item" key={`${file.name}-${index}`}>
                {file.kind === "image" && file.preview ? (
                  <img className="ai-chat-pending-thumb" alt={file.name || "фото"} src={file.preview} />
                ) : (
                  <span className="ai-chat-pending-name">{file.name || "файл"}</span>
                )}
                <button
                  type="button"
                  className="ai-chat-pending-remove"
                  aria-label="Убрать файл"
                  onClick={() => setPending(pending.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="ai-chat-attach-wrap">
            <button
              type="button"
              className="ai-chat-attach"
              aria-label="Прикрепить"
              title="Прикрепить"
              aria-expanded={attachOpen}
              onClick={(event) => {
                event.stopPropagation();
                setEmojiOpen(false);
                setAttachOpen((value) => !value);
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <div className="ai-chat-attach-menu" hidden={!attachOpen}>
              <button type="button" className="ai-chat-attach-choice" onClick={() => { setAttachOpen(false); photoRef.current?.click(); }}>
                <span>Загрузить фото</span>
              </button>
              <button type="button" className="ai-chat-attach-choice" onClick={() => { setAttachOpen(false); fileRef.current?.click(); }}>
                <span>Загрузить файл</span>
              </button>
            </div>
          </div>
          <button
            type="button"
            className="ai-chat-emoji-btn"
            aria-label="Эмодзи"
            title="Эмодзи"
            aria-expanded={emojiOpen}
            onClick={(event) => {
              event.stopPropagation();
              setAttachOpen(false);
              setEmojiOpen((value) => !value);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="9" cy="10" r="1.1" fill="currentColor" />
              <circle cx="15" cy="10" r="1.1" fill="currentColor" />
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M8.4 14.4c1.1 1.3 2.3 1.9 3.6 1.9s2.5-.6 3.6-1.9" />
            </svg>
          </button>
          <textarea
            ref={inputRef}
            className="ai-chat-input"
            name="message"
            placeholder="Напишите вопрос или прикрепите файл…"
            autoComplete="off"
            maxLength={800}
            rows={1}
            enterKeyHint="send"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(event.currentTarget.value);
              }
            }}
          />
          <button type="submit" className="ai-chat-send" aria-label="Отправить" title="Отправить" disabled={sending}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M3.05 20.95 21 12 3.05 3.05 3 10.2 15.2 12 3 13.8z" />
            </svg>
          </button>
          <input ref={photoRef} className="ai-chat-file" type="file" multiple accept="image/*" hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          <input ref={fileRef} className="ai-chat-file" type="file" multiple accept="*/*" hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          <div className="ai-chat-emoji-pop" hidden={!emojiOpen}>
            {EMOJIS.map((mark) => (
              <button
                type="button"
                className="ai-chat-emoji"
                key={mark}
                onClick={() => {
                  const input = inputRef.current;
                  const start = input?.selectionStart ?? draft.length;
                  const end = input?.selectionEnd ?? start;
                  const next = `${draft.slice(0, start)}${mark}${draft.slice(end)}`;
                  if (next.length > 800) return;
                  setDraft(next);
                  requestAnimationFrame(() => {
                    input?.focus();
                    const pos = start + mark.length;
                    input?.setSelectionRange(pos, pos);
                  });
                }}
              >
                {mark}
              </button>
            ))}
          </div>
        </form>
        <div className="ai-chat-resize ai-chat-resize--x" title="Изменить ширину" onPointerDown={(event) => bindResize(event, { x: true })} />
        <div className="ai-chat-resize ai-chat-resize--y" title="Изменить высоту" onPointerDown={(event) => bindResize(event, { y: true })} />
        <div className="ai-chat-resize ai-chat-resize--xy" title="Изменить размер" onPointerDown={(event) => bindResize(event, { x: true, y: true })} />
      </div>
    </div>
  );
}
