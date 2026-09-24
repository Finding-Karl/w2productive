import type { Browser } from 'wxt/browser';
import { ALWAYS_ALLOWED, type ListConfig } from './domain';

type Rule = Browser.declarativeNetRequest.Rule;

/** Rule IDs we own. Everything else in the dynamic ruleset is left alone. */
export const RULE_IDS = { redirect: 1, allow: 2 } as const;

/**
 * Build the dynamic DNR rules for the current list config.
 *
 * Only main_frame requests are matched: we block page loads, not the images/iframes
 * other sites embed from YouTube etc. The original URL is passed to the block page in
 * the hash via regexSubstitution (\0 = whole match), so it can offer "continue" later.
 */
export function buildBlockRules(cfg: ListConfig, blockedPageUrl: string): Rule[] {
  const redirect = {
    type: 'redirect',
    redirect: { regexSubstitution: `${blockedPageUrl}#\\0` },
  } as Rule['action'];
  const base = { regexFilter: '^https?://.*', resourceTypes: ['main_frame'] } as Rule['condition'];

  if (cfg.listMode === 'blocklist') {
    // requestDomains can't be empty; an empty blocklist means no rules at all.
    if (cfg.blocklist.length === 0) return [];
    return [
      {
        id: RULE_IDS.redirect,
        priority: 1,
        action: redirect,
        condition: { ...base, requestDomains: cfg.blocklist },
      },
    ];
  }

  // Allowlist: redirect everything, then a higher-priority allow rule punches holes.
  return [
    { id: RULE_IDS.redirect, priority: 1, action: redirect, condition: base },
    {
      id: RULE_IDS.allow,
      priority: 2,
      action: { type: 'allow' } as Rule['action'],
      condition: {
        requestDomains: [...cfg.allowlist, ...ALWAYS_ALLOWED],
        resourceTypes: ['main_frame'],
      } as Rule['condition'],
    },
  ];
}
