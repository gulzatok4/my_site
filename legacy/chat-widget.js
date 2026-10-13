(() => {
  const NAME = "Айгуль";
  const PHONE_DISPLAY = "8 705 140 69 40";
  const WA = "https://wa.me/77051406940";
  const EMOJIS = [
    "😀", "😊", "😂", "😍", "😘", "😉", "😎", "🤔",
    "😅", "🥰", "🤗", "👋", "👍", "👏", "🙏", "❤️",
    "💕", "🌸", "🌹", "💐", "🎉", "✨", "⭐", "✅",
    "💬", "📷", "📎", "👰", "💍", "🎁", "🧺", "💻",
  ];

  function replyFor(text) {
    const q = String(text || "")
      .toLowerCase()
      .replace(/ё/g, "е");

    if (/привет|здравств|добр|салем|hello|hi\b/.test(q)) {
      return `Здравствуйте! Я ${NAME}, консультант. Помогу с услугами, товарами и заказом. Что вас интересует?`;
    }
    if (/услуг|it|айти|crm|бот|сайт|систем|ролик|видео|нейро/.test(q)) {
      return [
        "Услуги Gulzat:",
        "• IT-системы и CRM, поддержка, боты",
        "• Сайты и лендинги для продаж",
        "• ИИ-ролики для бизнеса и соцсетей",
        "",
        "Цена от 15 000 ₸ — зависит от сложности. Могу подсказать, с чего начать, или сразу открыть каталог услуг.",
      ].join("\n");
    }
    if (/товар|издел|корзин|пуф|свадеб|набор|фотозон|рукодел|бархат/.test(q)) {
      return [
        "Товары ручной работы:",
        "• Готовые изделия и свадебные наборы",
        "• Национальные корзины — қалта",
        "• Пуфы — мягкие сиденья",
        "• Фотозоны и декор под ваш дизайн",
        "",
        "Цена от 5 000 ₸ — индивидуальные заказы. Нажмите «Все товары» в магазине или напишите, что нужно.",
      ].join("\n");
    }
    if (/цен|стоим|сколько|прайс|₸|тенге|доллар/.test(q)) {
      return [
        "Ориентир: услуги — от 15 000 ₸, товары — от 5 000 ₸. Точную сумму и сроки подтвердит Гульзат после короткого описания задачи.",
        "",
        "Могу сразу перевести вас к ней. Напишите в WhatsApp:",
        WA,
        "",
        "Готовый текст:",
        "Здравствуйте, Гульзат! Хочу уточнить стоимость. Нужно: ...",
      ].join("\n");
    }
    if (/связат|контакт|телефон|whatsapp|ватсап|написать|заказ|гульзат/.test(q)) {
      return [
        "Чтобы оформить заказ или уточнить детали, лучше написать Гульзат напрямую — она подтвердит цену и сроки лично.",
        "",
        `WhatsApp: ${WA}`,
        `Телефон: ${PHONE_DISPLAY}`,
        "",
        "Готовый текст:",
        "Здравствуйте, Гульзат! Пишу с сайта. Хочу заказать: ...",
      ].join("\n");
    }
    if (/достав|город|алмат|астан|шымкент|оплат|предоплат|kaspi|каспи/.test(q)) {
      return [
        "Можно забрать самому, заказать курьера / такси по городу или отправку по Казахстану почтой или транспортной компанией.",
        "Оплата — 100% предоплата, после неё заказ запускается в работу. Срок, адрес и стоимость доставки подтвердит Гульзат.",
        "",
        `WhatsApp: ${WA}`,
        "",
        "Готовый текст:",
        "Здравствуйте, Гульзат! Нужно уточнить доставку. Город: ...",
      ].join("\n");
    }
    if (/спасиб|рахмет|thanks/.test(q)) {
      return "Пожалуйста! Если появятся вопросы по услугам или товарам — я рядом.";
    }

    return [
      `Я ${NAME}, консультант сайта.`,
      "Могу рассказать про IT-услуги, изделия ручной работы, цены и как оформить заказ.",
      "Спросите, например: «какие услуги», «какие товары», «цены» или «как связаться».",
    ].join(" ");
  }

  function el(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else node.setAttribute(key, value);
    });
    return node;
  }

  function toHref(raw) {
    let token = String(raw || "")
      .trim()
      .replace(/[.,;:!?]+$/g, "")
      .replace(/^<(.*)>$/, "$1");
    if (/^wa\.me\//i.test(token)) token = "https://" + token;
    if (/^https?:\/\//i.test(token)) return token;
    const digits = token.replace(/\D/g, "");
    if (digits.length >= 10) {
      let n = digits;
      if (n.length === 11 && n.startsWith("8")) n = "7" + n.slice(1);
      if (n.length === 10) n = "7" + n;
      return "tel:+" + n;
    }
    return token;
  }

  function linkLabel(href, raw) {
    if (/wa\.me/i.test(href)) return href.replace(/^https?:\/\//i, "");
    return raw;
  }

  function stripMarkdown(text) {
    return String(text || "")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$2")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^(\s*)\*\s+/gm, "$1• ");
  }

  function fillBubble(bubble, text) {
    bubble.replaceChildren();
    const s = stripMarkdown(text);
    const re =
      /(https?:\/\/[^\s<>"']+|wa\.me\/[^\s<>"']+|\+7[\d\s\-()]{9,}|8\s?705\s?140\s?69\s?40)/gi;
    let last = 0;
    let match;
    while ((match = re.exec(s))) {
      if (match.index > last) {
        bubble.appendChild(document.createTextNode(s.slice(last, match.index)));
      }
      const raw = match[0];
      const href = toHref(raw);
      const link = el("a", "ai-chat-link", {
        href,
        target: href.startsWith("tel:") ? "_self" : "_blank",
        rel: "noopener noreferrer",
        text: linkLabel(href, raw),
      });
      bubble.appendChild(link);
      last = match.index + raw.length;
    }
    if (last < s.length) bubble.appendChild(document.createTextNode(s.slice(last)));
  }

  function addEntry(list, role, text, files = []) {
    const row = el("div", `ai-chat-row ai-chat-row--${role}`);
    const bubble = el("div", "ai-chat-bubble");
    if (files && files.length) {
      const media = el("div", "ai-chat-media");
      files.forEach((file) => {
        if (file.kind === "image" && file.preview) {
          const img = el("img", "ai-chat-thumb", { alt: file.name || "изображение" });
          img.src = file.preview;
          media.appendChild(img);
        } else {
          media.appendChild(el("div", "ai-chat-file-chip", { text: file.name || "файл" }));
        }
      });
      bubble.appendChild(media);
    }
    const body = el("div", "ai-chat-bubble-text");
    if (text) fillBubble(body, text);
    bubble.appendChild(body);
    row.appendChild(bubble);
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
    return body;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("read"));
      reader.readAsDataURL(file);
    });
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("read"));
      reader.readAsText(file);
    });
  }

  function looksLikeText(value) {
    const sample = String(value || "").slice(0, 4000);
    if (!sample.trim()) return false;
    let bad = 0;
    for (let i = 0; i < sample.length; i += 1) {
      const code = sample.charCodeAt(i);
      if (code === 9 || code === 10 || code === 13) continue;
      if (code < 32) bad += 1;
    }
    return bad / sample.length < 0.04;
  }

  function fileKind(file) {
    const name = file.name || "";
    const type = file.type || "";
    if (type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|heic|svg)$/i.test(name)) return "image";
    if (type.startsWith("video/") || /\.(mp4|mov|webm|avi|mkv)$/i.test(name)) return "video";
    if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
    if (
      type.startsWith("text/") ||
      /json|xml|javascript|csv/.test(type) ||
      /\.(txt|md|csv|json|xml|html|css|js|ts|log|rtf)$/i.test(name)
    ) {
      return "text";
    }
    return "file";
  }

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("image"));
      node.src = src;
    });
  }

  function toJpeg(img, maxSide, quality, maxChars) {
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (width < 1 || height < 1) throw new Error("empty");
    const scale = Math.min(1, maxSide / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    let q = quality;
    let dataUrl = canvas.toDataURL("image/jpeg", q);
    while (dataUrl.length > maxChars && q > 0.38) {
      q -= 0.08;
      dataUrl = canvas.toDataURL("image/jpeg", q);
    }
    return dataUrl;
  }

  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImageElement(url);
      return {
        dataUrl: toJpeg(img, 1280, 0.72, 900000),
        preview: toJpeg(img, 560, 0.68, 140000),
      };
    } catch {
      try {
        const raw = await readAsDataUrl(file);
        if (!raw) return { dataUrl: "", preview: "" };
        const img = await loadImageElement(raw);
        return {
          dataUrl: file.size <= 700000 ? raw : toJpeg(img, 1280, 0.7, 900000),
          preview: toJpeg(img, 560, 0.68, 140000),
        };
      } catch {
        return { dataUrl: "", preview: "" };
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function prepareFile(file) {
    const kind = fileKind(file);
    const item = {
      kind,
      name: file.name || "файл",
      type: file.type || "",
      preview: "",
      dataUrl: "",
      text: "",
    };
    if (kind === "image") {
      const packed = await compressImage(file);
      item.dataUrl = packed.dataUrl;
      item.preview = packed.preview || packed.dataUrl;
      return item;
    }
    if (kind === "pdf") {
      if (file.size > 2.5 * 1024 * 1024) return item;
      item.dataUrl = await readAsDataUrl(file);
      return item;
    }
    if (kind === "text") {
      const text = await readAsText(file);
      item.text = looksLikeText(text) ? text.slice(0, 16000) : "";
      return item;
    }
    if (kind === "file" && file.size <= 400000) {
      const text = await readAsText(file);
      if (looksLikeText(text)) {
        item.kind = "text";
        item.text = text.slice(0, 16000);
      }
    }
    return item;
  }

  function mount() {
    if (document.body.classList.contains("admin-page")) return;
    if (document.getElementById("ai-chat")) return;

    const root = el("div", "ai-chat", { id: "ai-chat" });

    const toggle = el("button", "ai-chat-toggle", {
      type: "button",
      "aria-expanded": "false",
      "aria-controls": "ai-chat-panel",
      title: `консультант ${NAME}`,
    });
    toggle.innerHTML = `
      <span class="ai-chat-toggle-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4v2h12V8H6zm0 4v2h8v-2H6z"/></svg>
      </span>
      <span class="ai-chat-toggle-label">Спросить ${NAME}</span>`;

    const panel = el("div", "ai-chat-panel", {
      id: "ai-chat-panel",
      role: "dialog",
      "aria-label": `Чат с ${NAME}`,
      hidden: "",
    });

    const head = el("div", "ai-chat-head");
    head.innerHTML = `
      <div class="ai-chat-avatar" aria-hidden="true">А</div>
      <div class="ai-chat-head-text">
        <strong>${NAME}</strong>
        <span>консультант сайта</span>
      </div>`;
    const closeBtn = el("button", "ai-chat-close", {
      type: "button",
      "aria-label": "Закрыть чат",
      title: "Закрыть",
    });
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>
      </svg>`;
    head.appendChild(closeBtn);

    const messages = el("div", "ai-chat-messages", { id: "ai-chat-messages" });

    const form = el("form", "ai-chat-form");
    const pendingWrap = el("div", "ai-chat-pending", { hidden: "" });
    const attachBtn = el("button", "ai-chat-attach", {
      type: "button",
      "aria-label": "Прикрепить",
      title: "Прикрепить",
      "aria-expanded": "false",
    });
    attachBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" d="M12 5v14M5 12h14"/>
      </svg>`;
    const attachMenu = el("div", "ai-chat-attach-menu", { hidden: "" });
    const photoChoice = el("button", "ai-chat-attach-choice", { type: "button" });
    photoChoice.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/>
        <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span>Загрузить фото</span>`;
    const fileChoice = el("button", "ai-chat-attach-choice", { type: "button" });
    fileChoice.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M7 3h7l5 5v13H7z"/>
        <path fill="none" stroke="currentColor" stroke-width="2" d="M14 3v5h5M9 13h6M9 17h4"/>
      </svg>
      <span>Загрузить файл</span>`;
    attachMenu.append(photoChoice, fileChoice);
    const attachWrap = el("div", "ai-chat-attach-wrap");
    attachWrap.append(attachBtn, attachMenu);
    const emojiBtn = el("button", "ai-chat-emoji-btn", {
      type: "button",
      "aria-label": "Эмодзи",
      title: "Эмодзи",
      "aria-expanded": "false",
    });
    emojiBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="9" cy="10" r="1.1" fill="currentColor"/>
        <circle cx="15" cy="10" r="1.1" fill="currentColor"/>
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8.4 14.4c1.1 1.3 2.3 1.9 3.6 1.9s2.5-.6 3.6-1.9"/>
      </svg>`;
    const emojiPop = el("div", "ai-chat-emoji-pop", { hidden: "" });
    EMOJIS.forEach((mark) => {
      const btn = el("button", "ai-chat-emoji", { type: "button", text: mark });
      btn.addEventListener("click", () => insertEmoji(mark));
      emojiPop.appendChild(btn);
    });
    const photoInput = el("input", "ai-chat-file", {
      type: "file",
      multiple: "",
      accept: "image/*",
      hidden: "",
    });
    const fileInput = el("input", "ai-chat-file", {
      type: "file",
      multiple: "",
      accept: "*/*",
      hidden: "",
    });
    const input = el("textarea", "ai-chat-input", {
      name: "message",
      placeholder: "Напишите вопрос или прикрепите файл…",
      autocomplete: "off",
      maxlength: "800",
      rows: "1",
    });
    input.setAttribute("enterkeyhint", "send");
    const sendBtn = el("button", "ai-chat-send", {
      type: "submit",
      "aria-label": "Отправить",
      title: "Отправить",
    });
    sendBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M3.05 20.95 21 12 3.05 3.05 3 10.2 15.2 12 3 13.8z"/>
      </svg>`;
    form.append(pendingWrap, attachWrap, emojiBtn, input, sendBtn, photoInput, fileInput, emojiPop);

    const resizeX = el("div", "ai-chat-resize ai-chat-resize--x", {
      title: "Изменить ширину",
      "aria-hidden": "true",
    });
    const resizeY = el("div", "ai-chat-resize ai-chat-resize--y", {
      title: "Изменить высоту",
      "aria-hidden": "true",
    });
    const resizeXY = el("div", "ai-chat-resize ai-chat-resize--xy", {
      title: "Изменить размер",
      "aria-hidden": "true",
    });

    panel.append(head, messages, form, resizeX, resizeY, resizeXY);
    root.append(toggle, panel);
    document.body.appendChild(root);

    const SIZE_KEY = "gulzat-chat-size";

    function sizeLimits() {
      return {
        minW: 300,
        minH: 360,
        maxW: Math.max(300, window.innerWidth - 24),
        maxH: Math.max(360, window.innerHeight - 80),
      };
    }

    function clampSize(n, min, max) {
      return Math.round(Math.min(max, Math.max(min, n)));
    }

    function applySize(width, height, save) {
      const lim = sizeLimits();
      if (width != null) {
        panel.style.width = `${clampSize(width, lim.minW, lim.maxW)}px`;
      }
      if (height != null) {
        const next = clampSize(height, lim.minH, lim.maxH);
        panel.style.height = `${next}px`;
        panel.style.maxHeight = `${next}px`;
      }
      if (save) {
        const rect = panel.getBoundingClientRect();
        try {
          localStorage.setItem(SIZE_KEY, JSON.stringify({ w: rect.width, h: rect.height }));
        } catch {
          /* ignore quota */
        }
      }
    }

    try {
      const saved = JSON.parse(localStorage.getItem(SIZE_KEY) || "null");
      if (saved && (saved.w || saved.h)) applySize(saved.w, saved.h, false);
    } catch {
      /* ignore broken storage */
    }

    window.addEventListener("resize", () => {
      const rect = panel.getBoundingClientRect();
      applySize(rect.width, rect.height, false);
    });

    function bindResize(handle, axes) {
      handle.addEventListener("pointerdown", (event) => {
        if (event.button != null && event.button !== 0) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const rect = panel.getBoundingClientRect();
        const startW = rect.width;
        const startH = rect.height;
        root.classList.add("is-resizing");
        handle.classList.add("is-active");

        const onMove = (moveEvent) => {
          applySize(
            axes.x ? startW + (startX - moveEvent.clientX) : null,
            axes.y ? startH + (startY - moveEvent.clientY) : null,
            false
          );
        };
        const onUp = () => {
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          handle.removeEventListener("pointercancel", onUp);
          root.classList.remove("is-resizing");
          handle.classList.remove("is-active");
          const next = panel.getBoundingClientRect();
          applySize(next.width, next.height, true);
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
      });
    }

    bindResize(resizeX, { x: true });
    bindResize(resizeY, { y: true });
    bindResize(resizeXY, { x: true, y: true });

    const HISTORY_KEY = "gulzat-chat-history-v2";
    try {
      localStorage.removeItem("gulzat-chat-history");
    } catch {
      /* ignore storage errors */
    }
    const history = [];
    const thread = [];
    const pending = [];
    let sending = false;

    function persistHistory() {
      const slim = (keepPreview) =>
        thread.slice(-40).map((item) => ({
          role: item.role,
          text: item.text || "",
          files: (item.files || []).map((file) => ({
            kind: file.kind,
            name: file.name || "",
            preview:
              keepPreview && file.kind === "image" && String(file.preview || "").startsWith("data:image/")
                ? file.preview
                : "",
          })),
        }));
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(slim(true)));
      } catch {
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(slim(false)));
        } catch {
          /* ignore quota */
        }
      }
    }

    function remember(role, text, files, apiText) {
      const display = String(text || "");
      thread.push({
        role,
        text: display,
        files: (files || []).map((file) => ({
          kind: file.kind,
          name: file.name || "",
          preview: file.preview || "",
        })),
      });
      const forApi = String(apiText || display || "").trim();
      if (forApi) {
        history.push({
          role: role === "user" ? "user" : "assistant",
          content: forApi,
        });
      }
      persistHistory();
    }

    function stripFileLabel(text) {
      return String(text || "").replace(/^\[файл:\s*.*\]\s*$/i, "").trim();
    }

    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(saved) && saved.length) {
        saved.forEach((item) => {
          const role = item.role === "user" ? "user" : "bot";
          const text = stripFileLabel(item.text);
          const files = Array.isArray(item.files) ? item.files : [];
          addEntry(messages, role, text, files);
          thread.push({ role, text, files });
          if (text) {
            history.push({
              role: role === "user" ? "user" : "assistant",
              content: text,
            });
          }
        });
        messages.dataset.greeted = "1";
      }
    } catch {
      /* ignore broken storage */
    }

    function renderPending() {
      pendingWrap.replaceChildren();
      if (!pending.length) {
        pendingWrap.hidden = true;
        return;
      }
      pendingWrap.hidden = false;
      pending.forEach((file, index) => {
        const item = el("div", "ai-chat-pending-item");
        if (file.kind === "image" && file.preview) {
          const img = el("img", "ai-chat-pending-thumb", { alt: file.name || "фото" });
          img.src = file.preview;
          item.appendChild(img);
        } else {
          item.appendChild(el("span", "ai-chat-pending-name", { text: file.name || "файл" }));
        }
        const removeBtn = el("button", "ai-chat-pending-remove", {
          type: "button",
          "aria-label": "Убрать файл",
          text: "×",
        });
        removeBtn.addEventListener("click", () => {
          pending.splice(index, 1);
          renderPending();
        });
        item.appendChild(removeBtn);
        pendingWrap.appendChild(item);
      });
    }

    async function addFiles(list) {
      const files = Array.from(list || []);
      for (const file of files) {
        if (pending.length >= 4) break;
        if (!file || file.size > 8 * 1024 * 1024) continue;
        try {
          pending.push(await prepareFile(file));
        } catch {
          pending.push({ kind: "file", name: file.name || "файл", preview: "", dataUrl: "", text: "" });
        }
      }
      renderPending();
    }

    function fallbackReply(text, files) {
      if (files.some((file) => file.kind === "image")) {
        return [
          "Получила фото. Если это национальные корзины — қалта, напишите, какой цвет хотите и к какой дате нужно.",
          "Если это фотозона — для какого события: свадьба, құдалық, юбилей или той?",
        ].join("\n");
      }
      if (files.length) {
        return "Получила файл. Опишите коротко, что нужно: изделие или услуга, цвет, количество и к какой дате.";
      }
      return replyFor(text);
    }

    function open() {
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("hidden", "");
      root.classList.add("is-open");
      if (!messages.dataset.greeted) {
        const hello = `Здравствуйте! Я ${NAME}, консультант. Подскажу по услугам, товарам и заказу. Можно прикрепить фото или файл.`;
        addEntry(messages, "bot", hello);
        remember("bot", hello, []);
        messages.dataset.greeted = "1";
      }
      messages.scrollTop = messages.scrollHeight;
      input.focus();
    }

    function close() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.removeAttribute("hidden");
      root.classList.remove("is-open");
      hidePops();
    }

    async function send(raw) {
      const text = String(raw || "").trim();
      if (sending || (!text && !pending.length)) return;
      sending = true;
      hideEmojiPop();
      hideAttachMenu();
      const files = pending.splice(0, pending.length);
      renderPending();
      addEntry(messages, "user", text, files);
      input.value = "";
      const previous = history.slice(-12);
      remember(
        "user",
        text,
        files,
        text || files.map((file) => `[${file.kind === "image" ? "фото" : "файл"}: ${file.name}]`).join(" ")
      );
      const bubble = addEntry(messages, "bot", "…");
      const attachments = files.map((file) => ({
        kind: file.kind,
        name: file.name,
        dataUrl: file.dataUrl || "",
        text: file.text || "",
      }));
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: previous, attachments }),
        });
        const data = await res.json().catch(() => ({}));
        const reply = String(data.reply || "").trim() || fallbackReply(text, files);
        fillBubble(bubble, reply);
        remember("bot", reply, []);
      } catch {
        const reply = fallbackReply(text, files);
        fillBubble(bubble, reply);
        remember("bot", reply, []);
      } finally {
        sending = false;
        messages.scrollTop = messages.scrollHeight;
      }
    }

    function hideEmojiPop() {
      emojiPop.hidden = true;
      emojiBtn.setAttribute("aria-expanded", "false");
    }

    function hideAttachMenu() {
      attachMenu.hidden = true;
      attachBtn.setAttribute("aria-expanded", "false");
    }

    function hidePops() {
      hideEmojiPop();
      hideAttachMenu();
    }

    function insertEmoji(mark) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const next = `${input.value.slice(0, start)}${mark}${input.value.slice(end)}`;
      if (next.length > 800) return;
      input.value = next;
      const pos = start + mark.length;
      input.focus();
      input.setSelectionRange(pos, pos);
    }

    toggle.addEventListener("click", () => {
      if (panel.hidden) open();
      else close();
    });
    closeBtn.addEventListener("click", close);
    attachBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      hideEmojiPop();
      const willOpen = attachMenu.hidden;
      attachMenu.hidden = !willOpen;
      attachBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    photoChoice.addEventListener("click", () => {
      hidePops();
      photoInput.click();
    });
    fileChoice.addEventListener("click", () => {
      hidePops();
      fileInput.click();
    });
    emojiBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      hideAttachMenu();
      const willOpen = emojiPop.hidden;
      emojiPop.hidden = !willOpen;
      emojiBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        hidePops();
        return;
      }
      if (attachWrap.contains(event.target) || emojiPop.contains(event.target) || emojiBtn.contains(event.target)) {
        return;
      }
      hidePops();
    });
    photoInput.addEventListener("change", async () => {
      await addFiles(photoInput.files);
      photoInput.value = "";
    });
    fileInput.addEventListener("change", async () => {
      await addFiles(fileInput.files);
      fileInput.value = "";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      send(input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send(input.value);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || panel.hidden) return;
      if (!emojiPop.hidden || !attachMenu.hidden) {
        event.stopPropagation();
        hidePops();
        return;
      }
      close();
    });

    function allowInnerScroll(event, el) {
      if (!(event.target instanceof Element) || !el || !el.contains(event.target)) return false;
      if (el.scrollHeight <= el.clientHeight + 1) return false;
      const delta = event.deltaY || 0;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      return (delta < 0 && !atTop) || (delta > 0 && !atBottom);
    }

    function stopPageScroll(event) {
      if (allowInnerScroll(event, messages) || allowInnerScroll(event, input)) return;
      event.preventDefault();
    }

    root.addEventListener("wheel", stopPageScroll, { passive: false });
    root.addEventListener(
      "touchmove",
      (event) => {
        if (event.target instanceof Element && (messages.contains(event.target) || input.contains(event.target))) {
          const el = messages.contains(event.target) ? messages : input;
          if (el.scrollHeight > el.clientHeight + 1) return;
        }
        event.preventDefault();
      },
      { passive: false }
    );
    root.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    root.addEventListener("drop", (event) => {
      event.preventDefault();
      if (event.dataTransfer && event.dataTransfer.files) addFiles(event.dataTransfer.files);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
