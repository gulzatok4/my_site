import { fallbackReply } from "./fallback.js";
import { formatPrice, loadProducts } from "../lib/catalog.js";

const CHAT_TIMEOUT_MS = 100000;

function liveCatalog() {
  try {
    return loadProducts()
      .slice(0, 24)
      .map((product) => ({
        name: String(product.name || "").trim(),
        itemType: product.itemType === "service" ? "service" : "product",
        price: Number(product.price) > 0 ? formatPrice(product.price, product.currency) : "",
      }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
}

export async function askAssistant({ message, history, attachments, files, signal }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CHAT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const empty = { reply: "", files: [], cart: [] };
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
    if (data.error === "timeout") return { ...empty, error: "timeout" };
    if (data.error === "rate" || data.error === "busy") return { ...empty, error: "rate" };
    const reply = String(data.reply || "").trim();
    if (res.ok && reply) {
      return {
        reply,
        files: Array.isArray(data.files) ? data.files : data.files && typeof data.files === "object" ? [data.files] : [],
        cart: Array.isArray(data.cart) ? data.cart : data.cart && data.cart.id ? [data.cart] : [],
        error: null,
      };
    }
  } catch {
    if (signal?.aborted && !timedOut) return { ...empty, error: "cancelled" };
    if (timedOut) return { ...empty, error: "timeout" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  return { reply: fallbackReply(message, files || [], liveCatalog()), files: [], cart: [], error: "unavailable" };
}
