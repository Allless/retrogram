/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TG_API_ID: string;
  readonly VITE_TG_API_HASH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Short git hash of the build, injected by vite.config.ts `define`. */
declare const __COMMIT_HASH__: string;
