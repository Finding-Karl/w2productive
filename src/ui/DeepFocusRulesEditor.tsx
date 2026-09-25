import { useState } from 'react';
import { DEEP_FOCUS_LIMITS } from '@/src/core/deepFocus';

export interface RuleValues {
  grace: number | null;
  min: number | null;
  max: number | null;
}

const [G_LO, G_HI] = DEEP_FOCUS_LIMITS.graceSeconds;
const [M_LO, M_HI] = DEEP_FOCUS_LIMITS.minutes;

/**
 * Grace window + check window editor. Used for moderator rules (blank = not set here)
 * and personal defaults (`required`: every field must have a value).
 */
export function DeepFocusRulesEditor(props: {
  title: string;
  hint?: string;
  value: RuleValues;
  editable: boolean;
  required?: boolean;
  onSave: (v: RuleValues) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(() => toDraft(props.value));
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const describe = (v: RuleValues) =>
    [
      v.grace != null ? `${v.grace}s to answer` : null,
      v.min != null && v.max != null
        ? `checks every ${v.min}–${v.max} min`
        : v.max != null
          ? `a check at least every ${v.max} min`
          : v.min != null
            ? `checks no more often than every ${v.min} min`
            : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Not set';

  if (!props.editable) {
    return (
      <div style={{ display: 'grid', gap: 2 }}>
        <strong>{props.title}</strong>
        <span className="muted" style={{ fontSize: 13 }}>{describe(props.value)}</span>
      </div>
    );
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSaved(false);
    const v = fromDraft(draft);
    const problem = validate(v, !!props.required);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await props.onSave(v);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof RuleValues, label: string, unit: string, [lo, hi]: readonly [number, number]) => (
    <label style={{ display: 'grid', gap: 2, fontSize: 13 }}>
      <span className="muted">{label}</span>
      <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
        <input
          type="number"
          min={lo}
          max={hi}
          value={draft[key]}
          placeholder={props.required ? undefined : '—'}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          style={{ width: 72 }}
        />
        <span className="muted">{unit}</span>
      </span>
    </label>
  );

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
      <div>
        <strong>{props.title}</strong>
        {props.hint && <div className="muted" style={{ fontSize: 13 }}>{props.hint}</div>}
      </div>
      <div className="row" style={{ alignItems: 'end' }}>
        {field('grace', 'Grace window', 'sec', DEEP_FOCUS_LIMITS.graceSeconds)}
        {field('min', 'Checks every', 'min', DEEP_FOCUS_LIMITS.minutes)}
        {field('max', 'to', 'min', DEEP_FOCUS_LIMITS.minutes)}
        <button type="submit" disabled={busy}>Save</button>
        {!props.required && (
          <button type="button" disabled={busy} onClick={() => setDraft({ grace: '', min: '', max: '' })}>Clear</button>
        )}
        {saved && <span className="muted" style={{ fontSize: 13 }}>Saved</span>}
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

type Draft = Record<keyof RuleValues, string>;
const toDraft = (v: RuleValues): Draft => ({
  grace: v.grace?.toString() ?? '',
  min: v.min?.toString() ?? '',
  max: v.max?.toString() ?? '',
});
const fromDraft = (d: Draft): RuleValues => ({
  grace: d.grace === '' ? null : Number(d.grace),
  min: d.min === '' ? null : Number(d.min),
  max: d.max === '' ? null : Number(d.max),
});

function validate(v: RuleValues, required: boolean): string | null {
  if (required && (v.grace == null || v.min == null || v.max == null)) return 'Fill in all three values';
  const bad = (n: number | null, lo: number, hi: number) => n != null && (!Number.isInteger(n) || n < lo || n > hi);
  if (bad(v.grace, G_LO, G_HI)) return `Grace window must be ${G_LO}–${G_HI} seconds`;
  if (bad(v.min, M_LO, M_HI) || bad(v.max, M_LO, M_HI)) return `Check window must be ${M_LO}–${M_HI} minutes`;
  if (v.min != null && v.max != null && v.min > v.max) return 'The earliest check can’t be later than the latest';
  return null;
}
