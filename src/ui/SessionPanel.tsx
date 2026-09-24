import { useState } from 'react';
import { creditFor, minimumSeconds } from '@/src/core/session';
import { send } from '@/src/messages';
import { settingsItem } from '@/src/storage/settings';
import { activeSessionItem } from '@/src/storage/state';
import { ConfirmButton } from './ConfirmButton';
import { clock, minutes } from './format';
import { useNow, useStorageItem } from './hooks';

/** Start/stop controls + live countdown. Used by the popup; stopLabel lets the block page say "Give up". */
export function SessionPanel({ stopLabel = 'Stop early' }: { stopLabel?: string }) {
  const session = useStorageItem(activeSessionItem);
  const settings = useStorageItem(settingsItem);
  const now = useNow(!!session);
  const [error, setError] = useState<string>();

  const run = async (msg: Parameters<typeof send>[0]) => {
    setError(undefined);
    const reply = await send(msg);
    if (!reply.ok) setError(reply.error);
  };

  if (session === undefined || !settings) return null;

  if (!session) {
    const presets = import.meta.env.DEV ? [1, ...settings.sessionPresets] : settings.sessionPresets;
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <span className="muted">Start a focus session (minutes)</span>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${presets.length}, 1fr)`, gap: 6 }}>
          {presets.map((m) => (
            <button
              key={m}
              className="primary"
              style={{ padding: '6px 0' }}
              onClick={() => run({ type: 'session/start', minutes: m })}
            >
              {m}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const remaining = (session.endsAt - now) / 1000;
  const focused = Math.max(0, (Math.min(now, session.endsAt) - session.startedAt) / 1000);
  const earnedIfStopped = creditFor(focused, session.plannedMinutes, settings);
  const minimum = minimumSeconds(session.plannedMinutes, settings);
  const toMinimum = minimum - focused;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span className="muted">Focusing · {session.plannedMinutes} min session</span>
      <div style={{ fontSize: 36, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {clock(remaining)}
      </div>
      <ConfirmButton
        label={stopLabel}
        confirmLabel={`Yes, ${stopLabel.toLowerCase()}`}
        hint={
          toMinimum > 0
            ? `You won't earn credit — ${clock(toMinimum)} left until the ${clock(minimum)} minimum for this session.`
            : `You'll keep ${minutes(earnedIfStopped)} of credit for the time focused so far.`
        }
        onConfirm={() => run({ type: 'session/stop' })}
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}
