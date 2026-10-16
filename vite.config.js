import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const imageDir = path.resolve("images");
const imageTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function serveImages() {
  return {
    name: "serve-images",
    configureServer(server) {
      server.middlewares.use("/images", (req, res, next) => {
        const rel = decodeURIComponent(String(req.url || "/").split("?")[0]).replace(/^\/+/, "");
        const file = path.resolve(imageDir, rel);
        const imageRoot = imageDir.endsWith(path.sep) ? imageDir : imageDir + path.sep;
        if ((!file.startsWith(imageRoot) && file !== imageDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", imageTypes[path.extname(file).toLowerCase()] || "application/octet-stream");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveImages()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/media": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
