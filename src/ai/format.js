export function stripMarkdown(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$2")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)\*\s+/gm, "$1• ");
}

export function toHref(raw) {
  let token = String(raw || "").trim().replace(/[.,;:!?]+$/g, "").replace(/^<(.*)>$/, "$1");
  if (/^wa\.me\//i.test(token)) token = `https://${token}`;
  if (/^https?:\/\//i.test(token)) return token;
  const digits = token.replace(/\D/g, "");
  if (digits.length >= 10) {
    let n = digits;
    if (n.length === 11 && n.startsWith("8")) n = `7${n.slice(1)}`;
    if (n.length === 10) n = `7${n}`;
    return `tel:+${n}`;
  }
  return token;
}

const LINK_RE = /(https?:\/\/[^\s<>"']+|wa\.me\/[^\s<>"']+|\+7[\d\s\-()]{9,}|8\s?705\s?140\s?69\s?40)/gi;

export function linkParts(text) {
  const source = stripMarkdown(text);
  const parts = [];
  let last = 0;
  let match;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(source))) {
    if (match.index > last) parts.push(source.slice(last, match.index));
    const raw = match[0];
    const href = toHref(raw);
    const label = /wa\.me/i.test(href) ? href.replace(/^https?:\/\//i, "") : raw;
    parts.push({ href, label });
    last = match.index + raw.length;
  }
  if (last < source.length) parts.push(source.slice(last));
  return parts;
}
