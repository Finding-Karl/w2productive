import { Fragment, useEffect, useState } from 'react';
import { toDayKey } from '@/src/core/dayKey';
import { windowRange, type LeaderboardWindow } from '@/src/core/windows';
import { loadGroupsData, type GroupsData } from '@/src/lib/groups';
import { collectiveLeaderboard, groupLeaderboard, type GroupRow, type MemberRow } from '@/src/lib/leaderboards';
import { send } from '@/src/messages';
import { settingsItem } from '@/src/storage/settings';
import { hm } from '../format';
import { useStorageItem } from '../hooks';
import { useAuthUser } from '../useAuthUser';

const WINDOWS: Record<LeaderboardWindow, string> = { day: 'Today', week: 'This week', month: 'This month', all: 'All time' };
export type Board = { kind: 'group' | 'collective'; id: string };

export function LeaderboardsView({ board, onBoard }: { board: Board | null; onBoard: (b: Board) => void }) {
  const user = useAuthUser();
  const settings = useStorageItem(settingsItem);
  const [win, setWin] = useState<LeaderboardWindow>('week');
  const [data, setData] = useState<GroupsData>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!user) return;
    // Push this device's latest sessions first so your own row is current.
    void send({ type: 'sync/now' })
      .then(loadGroupsData)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [user]);

  // Default to the first group once the list loads.
  useEffect(() => {
    if (!board && data?.groups[0]) onBoard({ kind: 'group', id: data.groups[0].id });
  }, [board, data, onBoard]);

  if (user === undefined || !settings) return null;
  if (!user) {
    return (
      <p className="muted">
        Sign in (Settings → Account) to see group and collective leaderboards.
      </p>
    );
  }
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  if (data.groups.length === 0) return <p className="muted">Join or create a group in Settings → Groups to get a leaderboard.</p>;

  const range = windowRange(win, toDayKey(Date.now(), settings.rolloverHour));
  const chip = (b: Board, label: string, sub: string) => (
    <button key={b.id} aria-pressed={board?.id === b.id} onClick={() => onBoard(b)}>
      {label} <span className="muted" style={{ fontSize: 11 }}>{sub}</span>
    </button>
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="seg" role="group" aria-label="Board">
          {data.groups.map((g) => chip({ kind: 'group', id: g.id }, g.name, 'group'))}
          {data.collectives.map((c) => chip({ kind: 'collective', id: c.id }, c.name, 'collective'))}
        </div>
        <div className="seg" role="group" aria-label="Time window">
          {(Object.keys(WINDOWS) as LeaderboardWindow[]).map((w) => (
            <button key={w} aria-pressed={win === w} onClick={() => setWin(w)}>{WINDOWS[w]}</button>
          ))}
        </div>
      </div>
      {board?.kind === 'group' && <GroupBoard groupId={board.id} range={range} me={user.id} />}
      {board?.kind === 'collective' && <CollectiveBoard collectiveId={board.id} range={range} me={user.id} />}
    </div>
  );
}

type Range = ReturnType<typeof windowRange>;

function useRows<T>(load: () => Promise<T[]>, deps: unknown[]) {
  const [rows, setRows] = useState<T[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    setRows(undefined);
    load().then(setRows, (e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { rows, error };
}

function GroupBoard({ groupId, range, me, compact }: { groupId: string; range: Range; me: string; compact?: boolean }) {
  const { rows, error } = useRows<MemberRow>(() => groupLeaderboard(groupId, range), [groupId, range.from, range.to]);
  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;
  const max = Math.max(1, ...rows.map((r) => r.focus_seconds));
  return (
    <table className="lb" style={compact ? { fontSize: 13 } : undefined}>
      <thead>
        <tr>
          <th style={{ width: 32 }}>#</th>
          <th>Member</th>
          <th className="barcell" aria-hidden />
          <th className="num">Focus</th>
          <th className="num" title="Time in deep focus sessions">Deep</th>
          <th className="num">Sessions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.user_id} className={r.user_id === me ? 'me' : undefined}>
            <td className="muted">{r.focus_seconds > 0 ? i + 1 : '–'}</td>
            <td>
              <a className="link" href={`#profile/${r.user_id}`}>{r.display_name ?? 'Someone'}</a>
              {r.user_id === me && <span className="tag" style={{ marginLeft: 6 }}>you</span>}
            </td>
            <td className="barcell"><div className="bar" style={{ width: `${(r.focus_seconds / max) * 100}%`, opacity: r.focus_seconds ? 1 : 0 }} /></td>
            <td className="num">{hm(r.focus_seconds)}</td>
            <td className="num muted">{r.deep_focus_seconds ? hm(r.deep_focus_seconds) : '–'}</td>
            <td className="num muted">{r.sessions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CollectiveBoard({ collectiveId, range, me }: { collectiveId: string; range: Range; me: string }) {
  const { rows, error } = useRows<GroupRow>(() => collectiveLeaderboard(collectiveId, range), [collectiveId, range.from, range.to]);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;
  const max = Math.max(1, ...rows.map((r) => r.focus_seconds));
  return (
    <table className="lb">
      <thead>
        <tr>
          <th style={{ width: 32 }}>#</th>
          <th>Group</th>
          <th className="barcell" aria-hidden />
          <th className="num">Focus</th>
          <th className="num" title="Time in deep focus sessions">Deep</th>
          <th className="num">Per member</th>
          <th className="num">Members</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <Fragment key={r.group_id}>
            <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(open === r.group_id ? null : r.group_id)} aria-expanded={open === r.group_id}>
              <td className="muted">{r.focus_seconds > 0 ? i + 1 : '–'}</td>
              <td>
                <span aria-hidden style={{ display: 'inline-block', width: 14 }}>{open === r.group_id ? '▾' : '▸'}</span>
                {r.group_name}
              </td>
              <td className="barcell"><div className="bar" style={{ width: `${(r.focus_seconds / max) * 100}%`, opacity: r.focus_seconds ? 1 : 0 }} /></td>
              <td className="num">{hm(r.focus_seconds)}</td>
              <td className="num muted">{r.deep_focus_seconds ? hm(r.deep_focus_seconds) : '–'}</td>
              <td className="num">{hm(r.members ? r.focus_seconds / r.members : 0)}</td>
              <td className="num muted">{r.members}</td>
            </tr>
            {open === r.group_id && (
              <tr>
                <td />
                <td colSpan={6} style={{ padding: '4px 0 12px' }}>
                  <GroupBoard groupId={r.group_id} range={range} me={me} compact />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
