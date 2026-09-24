import { isUrlBlocked, type ListConfig } from '@/src/core/domain';
import { buildBlockRules, RULE_IDS } from '@/src/core/rules';
import { effectiveLists } from '@/src/core/lists';
import { settingsItem } from '@/src/storage/settings';
import { activeSessionItem, inheritedListsItem } from '@/src/storage/state';

const OUR_RULE_IDS: number[] = Object.values(RULE_IDS);

function blockedPageUrl() {
  return browser.runtime.getURL('/blocked.html');
}

/** Personal lists merged with everything inherited from groups and collectives. */
async function listConfig(): Promise<ListConfig> {
  const [settings, inherited] = await Promise.all([settingsItem.getValue(), inheritedListsItem.getValue()]);
  return effectiveLists(settings, inherited.entries);
}

/** Re-apply rules if they're currently on (e.g. a group list changed mid-session). */
export async function refreshBlockingIfActive(): Promise<void> {
  if (await activeSessionItem.getValue()) await setBlocking(true);
}

/**
 * Turn blocking on or off. Dynamic rules persist across browser restarts, so this is
 * idempotent and safe to call from reconcile() whenever the worker wakes.
 */
export async function setBlocking(enabled: boolean): Promise<void> {
  const cfg = await listConfig();
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id).filter((id) => OUR_RULE_IDS.includes(id)),
    addRules: enabled ? buildBlockRules(cfg, blockedPageUrl()) : [],
  });
  // DNR only affects new navigations, so tabs already sitting on a blocked site
  // need an explicit redirect.
  if (enabled) await redirectOpenTabs(cfg);
}

async function redirectOpenTabs(cfg: ListConfig): Promise<void> {
  const base = blockedPageUrl();
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs
      .filter((t) => t.id != null && t.url && isUrlBlocked(t.url, cfg))
      .map((t) => browser.tabs.update(t.id!, { url: `${base}#${t.url}` }).catch(() => {})),
  );
}
