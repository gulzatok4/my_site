import { fallbackReply } from "./fallback.js";

const CHAT_TIMEOUT_MS = 120000;

export async function askAssistant({ message, history, attachments, files }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        message: message || "",
        history: history || [],
        attachments: attachments || [],
      }),
    });
    const data = await res.json().catch(() => ({}));
    const reply = String(data.reply || "").trim();
    if (reply) {
      return {
        reply,
        files: Array.isArray(data.files) ? data.files : [],
        cart: Array.isArray(data.cart) ? data.cart : [],
      };
    }
  } catch {
    /* сервер или модель недоступны — ответит локальный список правил */
  } finally {
    clearTimeout(timer);
  }
  return { reply: fallbackReply(message, files || []), files: [], cart: [] };
}
