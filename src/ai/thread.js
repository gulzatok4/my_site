export function newChatId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function apiHistory(thread) {
  return (Array.isArray(thread) ? thread : [])
    .filter((item) => item && !item.pending && !item.local)
    .map((item) => ({
      role: item.role === "user" ? "user" : "assistant",
      content: String(item.context || item.text || "").trim(),
    }))
    .filter((item) => item.content && item.content !== "…");
}

export function chatCartNote(skipped) {
  const names = (Array.isArray(skipped) ? skipped : []).map((name) => String(name || "").trim()).filter(Boolean);
  if (!names.length) return "";
  return `Не удалось добавить в корзину: ${names.join(", ")}. Такой позиции нет на сайте или она закончилась.`;
}

/** Вписывает сообщение этой вкладки в историю, которую могла уже изменить другая вкладка. */
export function mergeInflight(thread, inflight) {
  const list = (Array.isArray(thread) ? thread : []).filter((item) => item && typeof item === "object");
  if (!inflight?.user?.id) return list;
  const user = inflight.user;
  const tail = inflight.bot || inflight.pending || null;
  const drop = new Set([user.id, inflight.pending?.id, inflight.bot?.id].filter(Boolean));
  const kept = list.filter((item) => !drop.has(item.id));
  const anchor = list.findIndex((item) => item.id === user.id);
  if (anchor < 0) return [...kept, user, ...(tail ? [tail] : [])].slice(-100);
  const insertAt = list.slice(0, anchor).filter((item) => !drop.has(item.id)).length;
  return [...kept.slice(0, insertAt), user, ...(tail ? [tail] : []), ...kept.slice(insertAt)].slice(-100);
}
