// Ambient Workers bindings. Fetcher is declared with DOM Request/Response so it
// matches vinext's asset env; D1Database comes from @cloudflare/workers-types.
type D1Database = import("@cloudflare/workers-types/latest").D1Database;

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

/** The subset of the R2 bucket API the app uses, typed with DOM streams. */
interface FilesBucket {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
  delete(key: string): Promise<void>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    FILES?: FilesBucket;
    /** Secret for `npm run mpp:publish`; MPP uploads only. */
    MPP_PUBLISH_TOKEN?: string;
  };
}
