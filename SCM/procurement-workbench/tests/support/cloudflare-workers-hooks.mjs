// Node module hook for SSR tests: the built worker imports `cloudflare:workers`,
// which only exists in the Workers runtime. Tests set bindings on the shared env.
const SHIM = "export const env = (globalThis.__CLOUDFLARE_ENV__ ??= {});";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: `data:text/javascript,${encodeURIComponent(SHIM)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
