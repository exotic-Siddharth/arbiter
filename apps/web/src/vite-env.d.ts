/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" shows the "Try the demo" buttons (POST /api/auth/demo). */
  readonly VITE_DEMO_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
