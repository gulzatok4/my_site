const ADMIN_KEY_STORAGE = "gulzat_admin_key";
// Держать равным $script:AdminSchemaVersion в db/db.ps1.
export const ADMIN_SCHEMA_VERSION = 3;
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
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") headers["X-Admin-Schema"] = String(ADMIN_SCHEMA_VERSION);
  const key = adminKey();
  if (key) headers["X-Admin-Key"] = encodeURIComponent(key);
  const res = await fetch(url, { ...options, headers, cache: "no-store" });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error("bad_json");
      error.status = res.status || 500;
      throw error;
    }
  }
  if (!res.ok) {
    if (data.error === "outdated_client") window.dispatchEvent(new CustomEvent("gulzat:outdated-admin"));
    const error = new Error(data.error || `http_${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}
