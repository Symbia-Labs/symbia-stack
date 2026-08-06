/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IDENTITY_URL: string;
  readonly VITE_MESSAGING_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
