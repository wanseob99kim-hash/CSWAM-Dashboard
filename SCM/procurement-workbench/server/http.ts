// JSON envelope shared by the API routes: { success, data, error }.
export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

function respond<T>(status: number, body: ApiResponse<T>): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export const fail = (status: number, error: string) => respond(status, { success: false, data: null, error });
export const ok = <T>(data: T) => respond(200, { success: true, data, error: null });
export const created = <T>(data: T) => respond(201, { success: true, data, error: null });

/** Logs details to the Worker log only; clients get a generic message. */
export function serverError(area: string, context: string, error: unknown, message: string): Response {
  console.error(`[${area}] ${context}`, error);
  return fail(500, message);
}
