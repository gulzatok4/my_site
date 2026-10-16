import { useEffect, useRef, useState } from "react";
import { apiHistory, askAssistant, chatCartNote, linkParts, mergeInflight, NAME, newChatId } from "../ai/index.js";
import { applyAssistantCart } from "../lib/catalog.js";
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

function loadStoredRaw() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item === "object" && item.role) : [];
  } catch {
    return [];
  }
}

function loadThread() {
  return loadStoredRaw().filter((item) => !isStalePlaceholder(item));
}

function persistThread(thread) {
  const recent = thread.slice(-HISTORY_LIMIT);
  const slim = (previewCount) =>
    recent.map((item, index) => ({
      id: item.id || "",
      role: item.role,
      text: item.text || "",
      context: String(item.context || "").slice(0, 4000),
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
      ...(item.local ? { local: true } : {}),
      ...(item.automatic ? { automatic: true } : {}),
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
  const [photoFail, setPhotoFail] = useState("");
  const sendingRef = useRef(false);
  const inflightRef = useRef(null);
  const abortRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const rootRef = useRef(null);
  const photoRef = useRef(null);
  const fileRef = useRef(null);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    function onStorage(event) {
      if (event.key !== HISTORY_KEY) return;
      if (sendingRef.current && inflightRef.current) {
        const merged = mergeInflight(loadStoredRaw(), inflightRef.current);
        persistThread(merged);
        setMessages(merged);
        return;
      }
      setMessages(loadThread());
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
        if (kind === "image") {
          setPhotoFail(file.name || "фото");
          continue;
        }
        item = { kind: "file", name: file.name || "файл", type: file.type || "", preview: "", dataUrl: "", text: "" };
      }
      if (kind === "image" && !item.dataUrl) {
        setPhotoFail(file.name || "фото");
        continue;
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

  function cancelSend() {
    abortRef.current?.abort();
  }

  function publishInflight() {
    const merged = mergeInflight(loadStoredRaw(), inflightRef.current);
    remember(merged);
    return merged;
  }

  function sendWithoutPhoto() {
    const text = draft.trim();
    if (!text && !pending.length) {
      setNotice("Без этого фото отправлять нечего. Напишите сообщение или нажмите «Отмена».");
      return;
    }
    setPhotoFail("");
    send(undefined, { ignorePhoto: true });
  }

  async function send(raw, { ignorePhoto = false } = {}) {
    const text = String(raw ?? draft).trim();
    if (!ignorePhoto && photoFail) return;
    if (sendingRef.current || (!text && !pending.length)) return;
    sendingRef.current = true;
    setSending(true);
    setNotice("");
    setEmojiOpen(false);
    setAttachOpen(false);
    const files = pending;
    setPending([]);
    setDraft("");
    const previous = apiHistory(loadThread()).slice(-12);
    const apiText = text || files.map((file) => `[${file.kind === "image" ? "фото" : "файл"}: ${file.name}]`).join(" ");
    const userMsg = { id: newChatId(), role: "user", text, files, context: apiText };
    const pendingMsg = { id: newChatId(), role: "bot", text: "…", files: [], pending: true };
    inflightRef.current = { user: userMsg, pending: pendingMsg, bot: null };
    publishInflight();
    const attachments = files.map((file) => ({
      kind: file.kind,
      name: file.name,
      type: file.type || "",
      dataUrl: file.dataUrl || "",
      text: file.text || "",
    }));
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await askAssistant({
        message: text,
        history: previous,
        attachments,
        files,
        signal: controller.signal,
      });
      if (result.error === "cancelled" || (controller.signal.aborted && result.error !== "timeout")) {
        inflightRef.current = null;
        remember(loadStoredRaw().filter((item) => item.id !== userMsg.id && item.id !== pendingMsg.id));
        setDraft(text);
        setPending(files);
        return;
      }
      let reply = result.reply;
      let local = false;
      let added = [];
      if (result.error === "timeout") {
        reply = "Не успела ответить. Напишите ещё раз — я на связи.";
        local = true;
      } else if (result.error === "rate") {
        reply = "Слишком много сообщений подряд. Подождите минуту и напишите ещё раз.";
        local = true;
      } else if (result.error === "unavailable") {
        reply = `Консультант сейчас недоступен. Вот общая информация:\n${result.reply || "Сейчас не получилось ответить. Напишите ещё раз."}`;
        local = true;
      } else {
        try {
          const cart = applyAssistantCart(result.cart || []);
          added = cart.added;
          const note = chatCartNote(cart.skipped);
          if (note) reply = `${reply}\n\n${note}`;
        } catch {
          reply = `${reply}\n\nНе удалось обновить корзину в браузере. Откройте корзину и проверьте заказ.`;
        }
      }
      const digest = (result.files || [])
        .filter((file) => file && file.text)
        .map((file) => `[Файл «${file.name}»]\n${file.text}`)
        .join("\n\n");
      if (digest) userMsg.context = `${userMsg.context}\n\n${digest}`.slice(0, 4000);
      const botMsg = {
        id: newChatId(),
        role: "bot",
        text: reply,
        files: [],
        context: local ? "" : reply,
        ...(local ? { local: true } : {}),
        ...(result.error === "unavailable" ? { automatic: true } : {}),
        ...(added.length ? { cart: added } : {}),
      };
      inflightRef.current = { user: userMsg, pending: pendingMsg, bot: botMsg };
      publishInflight();
    } catch {
      const botMsg = {
        id: newChatId(),
        role: "bot",
        text: "Не получилось отправить. Напишите ещё раз.",
        files: [],
        local: true,
      };
      inflightRef.current = { user: userMsg, pending: pendingMsg, bot: botMsg };
      publishInflight();
    } finally {
      inflightRef.current = null;
      abortRef.current = null;
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
    if (!loadThread().length) {
      const hello = `Здравствуйте! Я ${NAME}, консультант. Подскажу по услугам, товарам и заказу. Можно прикрепить фото или файл.`;
      remember([{ id: newChatId(), role: "bot", text: hello, context: hello, files: [] }]);
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
              <div className={`ai-chat-bubble${item.automatic ? " is-auto" : ""}`}>
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
            if (sending) cancelSend();
            else send(draft);
          }}
        >
          <p className="form-note" role="status" hidden={!notice}>{notice}</p>
          {photoFail ? (
            <div className="form-note" role="alert">
              <p>Не удалось сжать фото «{photoFail}». Сообщение не отправлено.</p>
              <button type="button" onClick={sendWithoutPhoto}>Отправить без фото</button>
              <button type="button" onClick={() => setPhotoFail("")}>Отмена</button>
            </div>
          ) : null}
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
          <button type="submit" className="ai-chat-send" aria-label={sending ? "Остановить" : "Отправить"} title={sending ? "Остановить" : "Отправить"}>
            {sending ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M3.05 20.95 21 12 3.05 3.05 3 10.2 15.2 12 3 13.8z" />
              </svg>
            )}
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
