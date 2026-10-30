import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The demo console runs in the browser from the same files the product uses. Copy them next to the built site,
// so site/dist is one folder you can host anywhere (GitHub Pages, the EC2 box, a file share).
const CONSOLE_FILES = ["console.html", "public/console.js", "public/styles.css", "public/icon.svg", "public/manifest.webmanifest", "src/agent.js", "src/sim.js"];
function withConsole() {
  return {
    name: "wisprops-console",
    apply: "build",
    closeBundle() {
      for (const f of CONSOLE_FILES) {
        const to = resolve(root, "site/dist", f);
        mkdirSync(dirname(to), { recursive: true });
        cpSync(resolve(root, f), to);
      }
    },
  };
}

// Relative base so the built site works from any folder.
export default defineConfig({
  base: "./",
  plugins: [react(), withConsole()],
  build: { outDir: "dist", chunkSizeWarningLimit: 2000 },
});
