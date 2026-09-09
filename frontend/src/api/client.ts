import axios from 'axios';
import { translate } from '../i18n/activeTranslator';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api',
  // The JWT now lives in an httpOnly cookie the browser attaches itself —
  // script in this page cannot read it, so an XSS hole no longer leaks the
  // session. Cross-origin requests only carry cookies when this is set.
  withCredentials: true,
});

/**
 * The flip side of a cookie the browser sends automatically: it would also be
 * sent on a request forged by another site. The backend therefore requires
 * this token, which it hands out with the session and which only our own code
 * can read, on every state-changing call. Kept in a module variable rather
 * than storage so it dies with the tab; {@code GET /auth/me} re-issues it
 * after a reload.
 */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

let onSessionExpired: (() => void) | null = null;

/** Lets AuthProvider clear its own state when the backend rejects the session. */
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toUpperCase();
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      // 401 = not authenticated (missing/expired/revoked token) -> session is
      // dead, log out. 403 = authenticated but not allowed -> a legitimate
      // authorization outcome, not a reason to end the session (the backend
      // returns a real AuthenticationEntryPoint-driven 401 for the
      // unauthenticated case, so this distinction is reliable).
      const isSessionProbe = error.config?.url?.endsWith('/auth/me');
      if (error.response?.status === 401 && !isSessionProbe) {
        csrfToken = null;
        onSessionExpired?.();
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }
    return Promise.reject(error);
  }
);

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (error.response?.status === 401) return translate('errors.invalidCredentials');
    if (error.response?.status === 403) return translate('errors.forbidden');
    if (error.response?.status === 429) {
      return translate('errors.tooManyAttempts');
    }
  }
  return translate('errors.generic');
}

export default apiClient;
