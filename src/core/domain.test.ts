import { describe, expect, it } from 'vitest';
import { hostMatches, isUrlBlocked, normalizeDomain } from './domain';

describe('normalizeDomain', () => {
  it.each([
    ['youtube.com', 'youtube.com'],
    ['https://www.YouTube.com/watch?v=1', 'youtube.com'],
    ['  old.reddit.com/r/foo ', 'old.reddit.com'],
    ['localhost:5173', 'localhost'],
  ])('%s -> %s', (input, out) => expect(normalizeDomain(input)).toBe(out));

  it('rejects junk', () => {
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('notadomain')).toBeNull();
  });
});

describe('hostMatches', () => {
  it('matches exact and subdomains, not lookalikes', () => {
    expect(hostMatches('youtube.com', 'youtube.com')).toBe(true);
    expect(hostMatches('m.youtube.com', 'youtube.com')).toBe(true);
    expect(hostMatches('notyoutube.com', 'youtube.com')).toBe(false);
  });
});

describe('isUrlBlocked', () => {
  const block = { listMode: 'blocklist' as const, blocklist: ['reddit.com'], allowlist: [] };
  const allow = { listMode: 'allowlist' as const, blocklist: [], allowlist: ['github.com'] };

  it('blocklist blocks listed domains only', () => {
    expect(isUrlBlocked('https://www.reddit.com/r/x', block)).toBe(true);
    expect(isUrlBlocked('https://github.com', block)).toBe(false);
  });
  it('blocklist entries apply in allowlist mode too, and beat allows', () => {
    const both = { listMode: 'allowlist' as const, blocklist: ['gist.github.com'], allowlist: ['github.com'] };
    expect(isUrlBlocked('https://github.com', both)).toBe(false);
    expect(isUrlBlocked('https://gist.github.com', both)).toBe(true);
  });
  it('allowlist blocks everything else, but never localhost', () => {
    expect(isUrlBlocked('https://gist.github.com', allow)).toBe(false);
    expect(isUrlBlocked('https://reddit.com', allow)).toBe(true);
    expect(isUrlBlocked('http://localhost:3000', allow)).toBe(false);
  });
  it('never blocks non-web URLs', () => {
    expect(isUrlBlocked('chrome://extensions', allow)).toBe(false);
    expect(isUrlBlocked('chrome-extension://abc/popup.html', allow)).toBe(false);
  });
});
