import { useState } from 'react';

export interface ListItem {
  domain: string;
  /** Shown as a small tag, e.g. "Study group". Inherited items aren't removable here. */
  via?: string;
  removable: boolean;
}

/** Chips + add input. Parent owns persistence; errors from onAdd/onRemove are shown inline. */
export function ListEditor(props: {
  title: string;
  hint?: string;
  items: ListItem[];
  editable: boolean;
  placeholder?: string;
  onAdd: (domain: string) => Promise<unknown>;
  onRemove: (domain: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message ?? String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div>
        <strong>{props.title}</strong>
        {props.hint && <div className="muted" style={{ fontSize: 13 }}>{props.hint}</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {props.items.length === 0 && <span className="muted" style={{ fontSize: 13 }}>None</span>}
        {props.items.map((item) => (
          <span key={`${item.domain}|${item.via ?? ''}`} className="chip">
            {item.domain}
            {item.via && <span className="tag">{item.via}</span>}
            {item.removable && props.editable && (
              <button
                className="chip-x"
                aria-label={`Remove ${item.domain}`}
                disabled={busy}
                onClick={() => act(() => props.onRemove(item.domain))}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {props.editable && (
        <form
          style={{ display: 'flex', gap: 8 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            if (await act(() => props.onAdd(draft))) setDraft('');
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={props.placeholder ?? 'example.com'}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !draft.trim()}>Add</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
