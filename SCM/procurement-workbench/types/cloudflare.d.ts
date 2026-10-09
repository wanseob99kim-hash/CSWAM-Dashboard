// Ambient Workers bindings. Fetcher is declared with DOM Request/Response so it
// matches vinext's asset env; D1Database comes from @cloudflare/workers-types.
type D1Database = import("@cloudflare/workers-types/latest").D1Database;

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
  };
}
