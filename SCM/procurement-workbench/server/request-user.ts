import { userFromHeaders, type ChatGPTUser } from "../lib/auth-headers";

/**
 * Local development has no Sites identity headers. When VITE_DEV_USER_EMAIL is set
 * (e.g. in .env.development.local) the dev server acts as that user. import.meta.env.DEV
 * is false in production builds, so this fallback is compiled out there.
 */
const DEV_USER_EMAIL = import.meta.env.DEV ? import.meta.env.VITE_DEV_USER_EMAIL : undefined;

export function requestUser(request: Request): ChatGPTUser | null {
  const user = userFromHeaders(request.headers);
  if (user || !DEV_USER_EMAIL) return user;
  return { email: DEV_USER_EMAIL, displayName: DEV_USER_EMAIL, fullName: null };
}
