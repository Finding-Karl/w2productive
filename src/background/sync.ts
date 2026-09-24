import { fromCreditEventRow, fromFocusSessionRow, maxCreatedAt, pullSince, toCreditEventRow,
  toFocusSessionRow, type CreditEventRow, type FocusSessionRow } from '@/src/core/rows';
import { supabase } from '@/src/lib/supabase';
import { creditLedgerItem, sessionLogItem, syncStateItem } from '@/src/storage/state';
import type { InheritedEntry } from '@/src/core/lists';
import { applySyncResult } from './ledger';
import { setInheritedEntries } from './lists';
import { serialized } from './queue';

export const SYNC_ALARM = 'sync';
export const SYNC_PERIOD_MINUTES = 15;
const PAGE = 1000;

let inFlight: Promise<void> | null = null;

/** Coalesces concurrent requests into one run. Never throws; errors land in syncState. */
export function requestSync(): Promise<void> {
  inFlight ??= runSync().finally(() => (inFlight = null));
  return inFlight;
}

/**
 * Push the outbox, pull everything newer than our cursors, then merge under the state lock.
 * Network happens outside serialized() so a slow request never blocks Stop / session end;
 * the merge re-reads state, so anything recorded meanwhile is kept.
 */
async function runSync(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession(); // refreshes an expired token
  const user = data.session?.user;
  if (!user) return;

  try {
    const [state, ledger, log] = await Promise.all([
      syncStateItem.getValue(),
      creditLedgerItem.getValue(),
      sessionLogItem.getValue(),
    ]);
    // Signed into a different account than last time: pull that account from scratch.
    const cursors =
      state.userId === user.id ? state.cursors : { creditEvents: null, focusSessions: null };

    // Push
    const pendingE = new Set(state.pendingEventIds);
    const pendingS = new Set(state.pendingSessionIds);
    const events = ledger.filter((e) => pendingE.has(e.id));
    const sessions = log.filter((s) => pendingS.has(s.id));
    if (sessions.length) {
      const { error } = await supabase
        .from('focus_sessions')
        .upsert(sessions.map(toFocusSessionRow), { onConflict: 'id' });
      if (error) throw error;
    }
    if (events.length) {
      // Ledger rows are immutable: re-sending one we already pushed is a no-op.
      const { error } = await supabase
        .from('credit_events')
        .upsert(events.map(toCreditEventRow), { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }

    // Pull (RLS limits both to this user's rows)
    const eventRows = await pullAll<CreditEventRow>('credit_events', cursors.creditEvents);
    const sessionRows = await pullAll<FocusSessionRow>('focus_sessions', cursors.focusSessions);

    await serialized(() =>
      applySyncResult({
        userId: user.id,
        pulledEvents: eventRows.map(fromCreditEventRow),
        pulledSessions: sessionRows.map(fromFocusSessionRow),
        pushedEventIds: events.map((e) => e.id),
        pushedSessionIds: sessions.map((s) => s.id),
        cursors: {
          creditEvents: maxCreatedAt(eventRows, cursors.creditEvents),
          focusSessions: maxCreatedAt(sessionRows, cursors.focusSessions),
        },
      }),
    );

    // Group & collective lists: small, so refetch the whole set every time. Done after the
    // ledger merge so a failure here can't hold back credit sync.
    const { data: inherited, error: listsError } = await supabase.rpc('my_inherited_list_entries');
    if (listsError) throw listsError;
    await setInheritedEntries(
      (inherited as { source: InheritedEntry['source']; source_id: string; source_name: string;
        list: InheritedEntry['list']; domain: string }[]).map((r) => ({
        source: r.source,
        sourceId: r.source_id,
        sourceName: r.source_name,
        list: r.list,
        domain: r.domain,
      })),
    );
  } catch (e) {
    const message = (e as { message?: string })?.message ?? String(e);
    console.warn('[focus] sync failed', e);
    await serialized(async () => {
      const s = await syncStateItem.getValue();
      await syncStateItem.setValue({ ...s, lastError: message });
    });
  }
}

async function pullAll<T extends { created_at?: string }>(
  table: 'credit_events' | 'focus_sessions',
  cursor: string | null,
): Promise<T[]> {
  const byId = new Map<string, T>();
  let since = pullSince(cursor);
  let op: 'gt' | 'gte' = 'gt';
  for (;;) {
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      [op]('created_at', since)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    for (const row of data as (T & { id: string })[]) byId.set(row.id, row);
    const last = (data[data.length - 1] as T | undefined)?.created_at;
    // Next page starts *at* the last timestamp (gte) so rows sharing it aren't skipped;
    // the id map drops the repeats. Stop on a short page or if we're not advancing.
    if (data.length < PAGE || !last || last === since) return [...byId.values()];
    since = last;
    op = 'gte';
  }
}
