export function imageSrc(src) {
  const value = String(src || "");
  if (!value) return "";
  if (
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("/") ||
    /^https?:/i.test(value)
  ) {
    return value;
  }
  return `/${value.replace(/^\.\//, "")}`;
}

export function compressImageFile(file, maxSide = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas"));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("image"));
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read"));
    reader.readAsDataURL(file);
  });
}

export const CHAT_DOC_LIMIT = 5 * 1024 * 1024;
export const CHAT_IMAGE_LIMIT = 8 * 1024 * 1024;
export const CHAT_PAYLOAD_LIMIT = 14000000;

export function fileKind(file) {
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

async function compressChatImage(file) {
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

export async function prepareChatFile(file) {
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
    const packed = await compressChatImage(file);
    item.dataUrl = packed.dataUrl;
    item.preview = packed.preview || packed.dataUrl;
    return item;
  }
  if (kind === "video" || !file.size || file.size > CHAT_DOC_LIMIT) return item;
  item.dataUrl = await readAsDataUrl(file);
  return item;
}
