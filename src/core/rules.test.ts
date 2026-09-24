import { describe, expect, it } from 'vitest';
import { buildBlockRules, RULE_IDS } from './rules';

const PAGE = 'chrome-extension://abc/blocked.html';

describe('buildBlockRules', () => {
  it('blocklist mode: one redirect rule scoped to the blocked domains', () => {
    const rules = buildBlockRules({ listMode: 'blocklist', blocklist: ['x.com'], allowlist: ['ignored.com'] }, PAGE);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(RULE_IDS.block);
    expect(rules[0]!.condition.requestDomains).toEqual(['x.com']);
    expect(rules[0]!.condition.resourceTypes).toEqual(['main_frame']);
    expect(rules[0]!.action.redirect?.regexSubstitution).toBe(`${PAGE}#\\0`);
  });

  it('blocklist mode: empty list produces no rules', () => {
    expect(buildBlockRules({ listMode: 'blocklist', blocklist: [], allowlist: [] }, PAGE)).toEqual([]);
  });

  it('allowlist mode: catch-all redirect < allow < block', () => {
    const rules = buildBlockRules({ listMode: 'allowlist', blocklist: ['x.com'], allowlist: ['github.com'] }, PAGE);
    const byId = Object.fromEntries(rules.map((r) => [r.id, r]));
    const catchAll = byId[RULE_IDS.allowlistCatchAll]!;
    const allow = byId[RULE_IDS.allowlistAllow]!;
    const block = byId[RULE_IDS.block]!;
    expect(catchAll.condition.requestDomains).toBeUndefined();
    expect(allow.action.type).toBe('allow');
    expect(allow.condition.requestDomains).toEqual(expect.arrayContaining(['github.com', 'localhost']));
    expect(catchAll.priority!).toBeLessThan(allow.priority!);
    expect(allow.priority!).toBeLessThan(block.priority!);
  });

  it('allowlist mode with no blocks: just catch-all + allow', () => {
    const rules = buildBlockRules({ listMode: 'allowlist', blocklist: [], allowlist: [] }, PAGE);
    expect(rules.map((r) => r.id).sort()).toEqual([RULE_IDS.allowlistCatchAll, RULE_IDS.allowlistAllow]);
  });
});
