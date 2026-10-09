/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only stand-in for the Sites identity header; see server/workspace-handlers.ts. */
  readonly VITE_DEV_USER_EMAIL?: string;
}
