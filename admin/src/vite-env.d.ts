/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ENV_NAME?: string
  readonly VITE_ROUTER_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
