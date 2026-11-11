/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Build-time Aptabase tier: minimal | basic | standard | full (default basic). */
  readonly VITE_ANALYTICS_LEVEL?: string
}
