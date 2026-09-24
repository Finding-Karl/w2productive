import { describe, expect, it } from 'vitest';
import { buildBlockRules, RULE_IDS } from './rules';

const PAGE = 'chrome-extension://abc/blocked.html';

describe('buildBlockRules', () => {
  it('blocklist: one redirect rule scoped to the listed domains', () => {
    const rules = buildBlockRules({ listMode: 'blocklist', blocklist: ['x.com'], allowlist: [] }, PAGE);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(RULE_IDS.redirect);
    expect(rules[0]!.condition.requestDomains).toEqual(['x.com']);
    expect(rules[0]!.condition.resourceTypes).toEqual(['main_frame']);
    expect(rules[0]!.action.redirect?.regexSubstitution).toBe(`${PAGE}#\\0`);
  });

  it('blocklist: empty list produces no rules', () => {
    expect(buildBlockRules({ listMode: 'blocklist', blocklist: [], allowlist: [] }, PAGE)).toEqual([]);
  });

  it('allowlist: catch-all redirect plus higher-priority allow', () => {
    const rules = buildBlockRules({ listMode: 'allowlist', blocklist: [], allowlist: ['github.com'] }, PAGE);
    const [redirect, allow] = rules;
    expect(redirect!.condition.requestDomains).toBeUndefined();
    expect(allow!.action.type).toBe('allow');
    expect(allow!.priority).toBeGreaterThan(redirect!.priority!);
    expect(allow!.condition.requestDomains).toContain('github.com');
    expect(allow!.condition.requestDomains).toContain('localhost');
  });
});
