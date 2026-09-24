/** Pure domain helpers shared by rule building and tab redirection. */

/** "https://www.YouTube.com/watch?v=1" -> "youtube.com". Returns null if unparseable. */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `http://${s}`;
  try {
    const host = new URL(s).hostname.replace(/^www\./, '').replace(/\.$/, '');
    return host.includes('.') || host === 'localhost' ? host : null;
  } catch {
    return null;
  }
}

/** True if host is the domain or a subdomain of it (same semantics as DNR requestDomains). */
export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Always reachable in allowlist mode so the user can't lock themselves out of local dev. */
export const ALWAYS_ALLOWED = ['localhost', '127.0.0.1'];

/**
 * Effective (already merged) lists. Semantics:
 *  - blocklist applies in BOTH modes, and always beats the allowlist.
 *  - allowlist only matters in allowlist mode, where anything not on it is blocked.
 */
export interface ListConfig {
  listMode: 'blocklist' | 'allowlist';
  blocklist: string[];
  allowlist: string[];
}

/** Whether a URL would be blocked by the given list config. Non-http(s) URLs are never blocked. */
export function isUrlBlocked(url: string, cfg: ListConfig): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (cfg.blocklist.some((d) => hostMatches(host, d))) return true;
  if (cfg.listMode === 'blocklist') return false;
  return ![...cfg.allowlist, ...ALWAYS_ALLOWED].some((d) => hostMatches(host, d));
}
