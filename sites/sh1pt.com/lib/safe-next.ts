/**
 * A post-login `next` target, kept on this site. Only same-origin relative
 * paths pass. Browsers and the WHATWG URL parser drop tabs/newlines and read
 * `\` as `/`, so `//evil.example`, `/\evil.example` and `/\t/evil.example`
 * all leave the site; those, and anything not resolving same-origin, fall
 * back.
 */
const BASE = 'http://same-origin.invalid';

export function safeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || raw.length > 500) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
