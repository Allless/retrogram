import { defineConfig } from "vite";
import { execSync } from "child_process";
import { resolve } from "path";
import preact from "@preact/preset-vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

/** Deployed commit, injected so the footer can link the exact source build. */
function commitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  base: "/retrogram/",
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash()),
  },
  root: "src",
  // Load .env from the project root, not from `root` (src), which is Vite's default.
  envDir: __dirname,
  plugins: [preact(), nodePolyfills()],
  appType: "mpa",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
        "404": resolve(__dirname, "src/404.html"),
      },
    },
  },
  worker: {
    format: "es",
  },
  test: {
    root: ".",
  },
});
