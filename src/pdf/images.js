import { imageSrc } from "../lib/media.js";

const POOL = 4;
const cache = new Map();

export function prepareLogo() {
  return loadImage("/logo.png", { maxSide: 300, mime: "image/png", placeholder: "png" });
}

export function prepareProductPhotos(products) {
  return mapLimit(products, POOL, (product) =>
    loadImage(imageSrc(product?.image), { maxSide: 600, mime: "image/jpeg", quality: 0.8, placeholder: "jpeg" })
  );
}

function loadImage(url, options) {
  const key = `${options.mime}|${options.maxSide}|${url || ""}`;
  if (cache.has(key)) return cache.get(key);
  const task = renderImage(url, options);
  cache.set(key, task);
  return task;
}

async function renderImage(url, options) {
  if (!url) return placeholder(options.placeholder);
  try {
    const img = await decodeImage(url);
    return rasterize(img, options);
  } catch (error) {
    console.error(error);
    return placeholder(options.placeholder);
  }
}

function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Не удалось загрузить картинку: ${url}`));
    img.src = url;
  });
}

function rasterize(img, { maxSide, mime, quality }) {
  const sourceWidth = img.naturalWidth || img.width || 1;
  const sourceHeight = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#faf8f2";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL(mime, quality);
}

function placeholder(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = kind === "png" ? 300 : 600;
  canvas.height = kind === "png" ? 300 : 450;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#e5e9d8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#6b7a3d";
  const side = Math.round(canvas.width * 0.16);
  ctx.fillRect((canvas.width - side) / 2, (canvas.height - side) / 2, side, side);
  return canvas.toDataURL(kind === "png" ? "image/png" : "image/jpeg", 0.8);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const count = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: count }, () => run()));
  return results;
}
