import type { Browser } from 'wxt/browser';
import { ALWAYS_ALLOWED, type ListConfig } from './domain';

type Rule = Browser.declarativeNetRequest.Rule;

/** Rule IDs we own. Everything else in the dynamic ruleset is left alone. */
export const RULE_IDS = { allowlistCatchAll: 1, allowlistAllow: 2, block: 3 } as const;

/**
 * Build the dynamic DNR rules for effective (merged) lists.
 *
 *   priority 3  block      redirect blocklist domains          (both modes)
 *   priority 2  allow      allowlist domains + localhost       (allowlist mode)
 *   priority 1  catch-all  redirect every http(s) page         (allowlist mode)
 *
 * DNR picks the highest-priority matching rule, so a block from any level beats any
 * allow — which is what makes group/collective blocks un-overridable.
 *
 * Only main_frame requests are matched: we block page loads, not the images/iframes
 * other sites embed. The original URL is passed to the block page in the hash via
 * regexSubstitution (\0 = whole match).
 */
export function buildBlockRules(cfg: ListConfig, blockedPageUrl: string): Rule[] {
  const redirect = {
    type: 'redirect',
    redirect: { regexSubstitution: `${blockedPageUrl}#\\0` },
  } as Rule['action'];
  const anyPage = { regexFilter: '^https?://.*', resourceTypes: ['main_frame'] } as Rule['condition'];
  const rules: Rule[] = [];

  if (cfg.listMode === 'allowlist') {
    rules.push(
      { id: RULE_IDS.allowlistCatchAll, priority: 1, action: redirect, condition: anyPage },
      {
        id: RULE_IDS.allowlistAllow,
        priority: 2,
        action: { type: 'allow' } as Rule['action'],
        condition: {
          requestDomains: [...new Set([...cfg.allowlist, ...ALWAYS_ALLOWED])],
          resourceTypes: ['main_frame'],
        } as Rule['condition'],
      },
    );
  }
  // requestDomains can't be empty, so no blocklist entries => no block rule.
  if (cfg.blocklist.length > 0) {
    rules.push({
      id: RULE_IDS.block,
      priority: 3,
      action: redirect,
      condition: { ...anyPage, requestDomains: [...new Set(cfg.blocklist)] },
    });
  }
  return rules;
}
