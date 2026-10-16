import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/pdf/**/*.test.{js,jsx}", "src/lib/**/*.test.js", "src/ai/**/*.test.js"],
  },
});
