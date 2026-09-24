import { useMemo, useState } from 'react';
import type { DayKey } from '@/src/core/dayKey';
import { calendarWeeks, level, type DayTotal } from '@/src/core/heatmap';
import { hm } from '../format';

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 30; // weekday labels
const TOP = 18; // month labels
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_LABELS: [number, string][] = [[0, 'Mon'], [2, 'Wed'], [4, 'Fri']];

export function longDate(key: DayKey): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** GitHub-style contribution calendar, intensity = focus time per day. Hand-rolled SVG. */
export function Heatmap(props: {
  totals: Map<DayKey, DayTotal>;
  end: DayKey;
  selected?: DayKey | null;
  onSelect?: (day: DayKey) => void;
}) {
  const weeks = useMemo(() => calendarWeeks(props.end), [props.end]);
  const [hover, setHover] = useState<{ key: DayKey; x: number; y: number } | null>(null);

  // A month label sits over the first column whose Monday falls in a new month.
  const monthLabels = useMemo(() => {
    const out: { col: number; label: string }[] = [];
    let prev = '';
    weeks.forEach((w, col) => {
      const first = w.find((k) => k) ?? '';
      const month = first.slice(0, 7);
      if (month && month !== prev) {
        if (col < weeks.length - 2) out.push({ col, label: MONTHS[Number(month.slice(5)) - 1]! });
        prev = month;
      }
    });
    return out.filter((m, i, arr) => i === 0 || m.col - arr[i - 1]!.col >= 3);
  }, [weeks]);

  const width = LEFT + weeks.length * STEP;
  const height = TOP + 7 * STEP;
  const hovered = hover && props.totals.get(hover.key);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Focus time per day over the last year" style={{ display: 'block', maxWidth: width * 1.25 }}>
        {monthLabels.map((m) => (
          <text key={m.col} x={LEFT + m.col * STEP} y={11} fontSize={10} fill="var(--muted)">{m.label}</text>
        ))}
        {WEEKDAY_LABELS.map(([row, label]) => (
          <text key={label} x={0} y={TOP + row * STEP + CELL - 2} fontSize={10} fill="var(--muted)">{label}</text>
        ))}
        {weeks.map((week, col) =>
          week.map((key, row) => {
            if (!key) return null;
            const t = props.totals.get(key);
            const lvl = level(t?.focusSeconds ?? 0);
            const isSel = props.selected === key;
            return (
              <rect
                key={key}
                x={LEFT + col * STEP}
                y={TOP + row * STEP}
                width={CELL}
                height={CELL}
                rx={2}
                fill={`var(--heat-${lvl})`}
                stroke={isSel ? 'var(--fg)' : 'none'}
                strokeWidth={isSel ? 1.5 : 0}
                style={{ cursor: props.onSelect ? 'pointer' : 'default' }}
                aria-label={`${longDate(key)}: ${hm(t?.focusSeconds ?? 0)} focused`}
                onMouseEnter={(e) => setHover({ key, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ key, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
                onClick={() => props.onSelect?.(key)}
              />
            );
          }),
        )}
      </svg>
      {hover && (
        <div
          className="tooltip"
          // Flip to the left of the cursor near the right edge so it never clips.
          style={hover.x > window.innerWidth - 280 ? { right: window.innerWidth - hover.x + 12, top: hover.y - 36 } : { left: hover.x + 12, top: hover.y - 36 }}
        >
          <strong>{hovered ? hm(hovered.focusSeconds) : 'No focus'}</strong>
          {hovered ? ` · ${hovered.sessions} session${hovered.sessions === 1 ? '' : 's'}` : ''} — {longDate(hover.key)}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 4, fontSize: 11, marginTop: 6 }}>
        <span className="muted" title="Levels: none, under 30m, 30m–1h, 1–2h, 2h+">Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <svg key={l} width={CELL} height={CELL} aria-hidden>
            <rect width={CELL} height={CELL} rx={2} fill={`var(--heat-${l})`} />
          </svg>
        ))}
        <span className="muted">More</span>
      </div>
    </div>
  );
}
