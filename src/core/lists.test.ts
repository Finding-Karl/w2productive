import { describe, expect, it } from 'vitest';
import { isUrlBlocked } from './domain';
import { effectiveLists, inheritedKey, type InheritedEntry } from './lists';
import { buildBlockRules, RULE_IDS } from './rules';

const inh = (list: 'block' | 'allow', domain: string, source: 'group' | 'collective' = 'group'): InheritedEntry => ({
  source, sourceId: source === 'group' ? 'g1' : 'c1', sourceName: 'X', list, domain,
});
const PAGE = 'chrome-extension://abc/blocked.html';

describe('effectiveLists', () => {
  it('unions personal, group and collective entries (deduped)', () => {
    const cfg = effectiveLists(
      { listMode: 'blocklist', blocklist: ['reddit.com'], allowlist: [] },
      [inh('block', 'reddit.com'), inh('block', 'tiktok.com', 'collective'), inh('allow', 'github.com')],
    );
    expect(cfg.blocklist).toEqual(['reddit.com', 'tiktok.com']);
    expect(cfg.allowlist).toEqual(['github.com']);
  });

  it('blocklist mode: inherited blocks apply, allowlists are irrelevant', () => {
    const cfg = effectiveLists({ listMode: 'blocklist', blocklist: [], allowlist: [] }, [inh('block', 'x.com')]);
    expect(isUrlBlocked('https://x.com', cfg)).toBe(true);
    expect(isUrlBlocked('https://github.com', cfg)).toBe(false);
  });

  it('allowlist mode: a group allow extends your allowlist', () => {
    const cfg = effectiveLists({ listMode: 'allowlist', blocklist: [], allowlist: ['docs.google.com'] }, [
      inh('allow', 'github.com'),
    ]);
    expect(isUrlBlocked('https://github.com/pulls', cfg)).toBe(false);
    expect(isUrlBlocked('https://docs.google.com', cfg)).toBe(false);
    expect(isUrlBlocked('https://news.ycombinator.com', cfg)).toBe(true);
  });

  it('inherited blocks beat personal allows', () => {
    const cfg = effectiveLists({ listMode: 'allowlist', blocklist: [], allowlist: ['youtube.com'] }, [
      inh('block', 'youtube.com', 'collective'),
    ]);
    expect(isUrlBlocked('https://www.youtube.com', cfg)).toBe(true);
    // ...and the DNR layout agrees: block rule outranks the allow rule
    const rules = buildBlockRules(cfg, PAGE);
    const block = rules.find((r) => r.id === RULE_IDS.block)!;
    const allow = rules.find((r) => r.id === RULE_IDS.allowlistAllow)!;
    expect(block.priority).toBeGreaterThan(allow.priority!);
    expect(block.condition.requestDomains).toContain('youtube.com');
  });

  it('inheritedKey ignores order', () => {
    const a = [inh('block', 'a.com'), inh('allow', 'b.com')];
    expect(inheritedKey(a)).toBe(inheritedKey([...a].reverse()));
  });
});
