import { useEffect, useMemo, useState } from 'react';
import { addDays, toDayKey, type DayKey } from '@/src/core/dayKey';
import { dailyTotals, profileStats, type DayTotal } from '@/src/core/heatmap';
import type { SessionRecord } from '@/src/core/session';
import { profileActivity, profileName } from '@/src/lib/leaderboards';
import { settingsItem } from '@/src/storage/settings';
import { sessionLogItem } from '@/src/storage/state';
import { hm, minutes } from '../format';
import { useStorageItem } from '../hooks';
import { useAuthUser } from '../useAuthUser';
import { Heatmap, longDate } from './Heatmap';

/**
 * userId = null -> your own profile, built from the local session log (works offline and
 * includes sessions pulled from your other devices). Otherwise, someone you share a
 * leaderboard with, via profile_activity (daily totals only).
 */
export function ProfileView({ userId }: { userId: string | null }) {
  const settings = useStorageItem(settingsItem);
  const log = useStorageItem(sessionLogItem);
  const user = useAuthUser();
  const [remote, setRemote] = useState<{ name: string | null; totals: Map<DayKey, DayTotal> }>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<DayKey | null>(null);

  const today = settings ? toDayKey(Date.now(), settings.rolloverHour) : null;
  const from = today ? addDays(today, -365) : null;

  useEffect(() => {
    if (!userId || !today || !from) return;
    setRemote(undefined);
    setError(undefined);
    Promise.all([profileName(userId), profileActivity(userId, from, today)])
      .then(([name, rows]) =>
        setRemote({
          name,
          totals: new Map(rows.map((r) => [r.day_key, { focusSeconds: r.focus_seconds, sessions: r.sessions }])),
        }),
      )
      .catch((e: Error) => setError(e.message === 'not allowed' ? 'This profile is only visible to people who share a group or collective with them.' : e.message));
  }, [userId, today, from]);

  const own = !userId;
  const totals = useMemo(() => (own ? dailyTotals(log ?? []) : remote?.totals), [own, log, remote]);

  if (!today || !from) return null;
  if (error) return <p className="error">{error}</p>;
  if (!totals) return <p className="muted">Loading…</p>;

  const stats = profileStats(totals, from, today);
  const name = own ? (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'You' : remote?.name ?? 'Someone';
  const daySessions = own && selected ? (log ?? []).filter((s) => s.dayKey === selected) : [];

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22 }}>{name}</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {hm(stats.totalSeconds)} of focus in the last year
        </p>
      </div>

      <div className="row" style={{ gap: 32 }}>
        <Stat value={String(stats.activeDays)} label="Days focused" />
        <Stat value={`${stats.currentStreak}d`} label="Current focus streak" />
        <Stat value={`${stats.longestStreak}d`} label="Longest focus streak" />
        <Stat value={stats.bestDay ? hm(stats.bestDay.focusSeconds) : '–'} label={stats.bestDay ? `Best day · ${longDate(stats.bestDay.key)}` : 'Best day'} />
      </div>

      <div className="card">
        <Heatmap totals={totals} end={today} selected={selected} onSelect={(d) => setSelected(d === selected ? null : d)} />
      </div>

      {selected && (
        <DayDetail day={selected} total={totals.get(selected)} sessions={daySessions} showSessions={own} />
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <span className="value">{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}

function DayDetail(props: { day: DayKey; total?: DayTotal; sessions: SessionRecord[]; showSessions: boolean }) {
  const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <strong>
        {longDate(props.day)} · {hm(props.total?.focusSeconds ?? 0)}
      </strong>
      {!props.total && <span className="muted">No focus sessions.</span>}
      {props.showSessions && props.sessions.length > 0 && (
        <table className="lb">
          <thead>
            <tr>
              <th>Time</th>
              <th>Session</th>
              <th className="num">Focused</th>
              <th className="num">Credit</th>
            </tr>
          </thead>
          <tbody>
            {props.sessions.map((s) => (
              <tr key={s.id}>
                <td>{time(s.startedAt)}–{time(s.endedAt)}</td>
                <td>
                  {s.plannedMinutes} min
                  {s.sessionType === 'deep' && <span className="tag" style={{ marginLeft: 6 }}>deep</span>}
                  {s.outcome === 'ended_early' && (
                    <span className="muted"> ({s.endReason === 'missed_check' ? 'missed a check' : 'ended early'})</span>
                  )}
                </td>
                <td className="num">{hm(s.focusedSeconds)}</td>
                <td className="num">{minutes(s.creditEarnedSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!props.showSessions && props.total && (
        <span className="muted">{props.total.sessions} session{props.total.sessions === 1 ? '' : 's'}</span>
      )}
    </div>
  );
}
