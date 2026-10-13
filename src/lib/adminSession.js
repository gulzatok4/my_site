const ADMIN_KEY_STORAGE = "gulzat_admin_key";
const listeners = new Set();

export function adminKey() {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setAdminKey(value) {
  const prev = adminKey();
  const next = value || "";
  if (prev === next) return;
  try {
    if (next) sessionStorage.setItem(ADMIN_KEY_STORAGE, next);
    else sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener(next));
}

export function subscribeAdmin(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function adminFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const key = adminKey();
  if (key) headers["X-Admin-Key"] = encodeURIComponent(key);
  const res = await fetch(url, { ...options, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `http_${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}
