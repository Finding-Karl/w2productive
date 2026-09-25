import { useState } from 'react';
import { resolveDeepFocus } from '@/src/core/deepFocus';
import { effectiveLists } from '@/src/core/lists';
import { creditFor, minimumSeconds, type SessionType } from '@/src/core/session';
import { send } from '@/src/messages';
import { settingsItem } from '@/src/storage/settings';
import { activeSessionItem, inheritedDeepFocusItem, inheritedListsItem } from '@/src/storage/state';
import { ConfirmButton } from './ConfirmButton';
import { clock, minutes } from './format';
import { useNow, useStorageItem } from './hooks';

/** Start/stop controls + live countdown. Used by the popup; stopLabel lets the block page say "Give up". */
export function SessionPanel({ stopLabel = 'Stop early' }: { stopLabel?: string }) {
  const session = useStorageItem(activeSessionItem);
  const settings = useStorageItem(settingsItem);
  const inheritedDeep = useStorageItem(inheritedDeepFocusItem);
  const inheritedLists = useStorageItem(inheritedListsItem);
  const now = useNow(!!session);
  const [error, setError] = useState<string>();
  const [type, setType] = useState<SessionType>('standard');

  const run = async (msg: Parameters<typeof send>[0]) => {
    setError(undefined);
    const reply = await send(msg);
    if (!reply.ok) setError(reply.error);
  };

  if (session === undefined || !settings || !inheritedDeep || !inheritedLists) return null;

  if (!session) {
    const presets = import.meta.env.DEV ? [1, ...settings.sessionPresets] : settings.sessionPresets;
    const rules = resolveDeepFocus(settings.deepFocus, inheritedDeep.rules);
    const allowed = effectiveLists({ ...settings, listMode: 'allowlist' }, inheritedLists.entries).allowlist;
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <div className="seg" role="group" aria-label="Session type" style={{ justifySelf: 'start' }}>
          <button aria-pressed={type === 'standard'} onClick={() => setType('standard')}>Standard</button>
          <button aria-pressed={type === 'deep'} onClick={() => setType('deep')}>Deep focus</button>
        </div>
        {type === 'deep' && (
          <div className="muted" style={{ fontSize: 12, display: 'grid', gap: 2 }}>
            <span>Allowed sites only. Random presence checks on your allowed pages every {rules.minMinutes}–{rules.maxMinutes} min{rules.setBy.window ? ` (${rules.setBy.window})` : ''}; {rules.graceSeconds}s to answer{rules.setBy.grace ? ` (${rules.setBy.grace})` : ''}. Miss one or stop early and the session isn’t saved.</span>
            {allowed.length === 0 && <span className="error">Your allowlist is empty — every site will be blocked.</span>}
          </div>
        )}
        <span className="muted">Start a focus session (minutes)</span>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${presets.length}, 1fr)`, gap: 6 }}>
          {presets.map((m) => (
            <button
              key={m}
              className="primary"
              style={{ padding: '6px 0' }}
              onClick={() => run({ type: 'session/start', minutes: m, sessionType: type })}
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
      <span className="muted">
        {session.type === 'deep' ? 'Deep focus' : 'Focusing'} · {session.plannedMinutes} min session
        {session.deep && ` · ${session.deep.checksPassed} check${session.deep.checksPassed === 1 ? '' : 's'} passed`}
      </span>

      <div style={{ fontSize: 36, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {clock(remaining)}
      </div>
      <ConfirmButton
        label={stopLabel}
        confirmLabel={`Yes, ${stopLabel.toLowerCase()}`}
        hint={
          session.type === 'deep'
            ? 'Deep focus is all or nothing — stopping now means this session won’t be saved.'
            : toMinimum > 0
              ? `You won't earn credit — ${clock(toMinimum)} left until the ${clock(minimum)} minimum for this session.`
              : `You'll keep ${minutes(earnedIfStopped)} of credit for the time focused so far.`
        }
        onConfirm={() => run({ type: 'session/stop' })}
        cancelLabel="Keep going"
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}
