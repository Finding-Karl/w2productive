import { useState, type ReactNode } from 'react';

/** Two-step button: first click arms it, second click runs. Avoids window.confirm in extension UI. */
export function ConfirmButton(props: {
  label: string;
  confirmLabel: string;
  hint?: ReactNode;
  onConfirm: () => unknown;
  cancelLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <button onClick={() => setArmed(true)}>{props.label}</button>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {props.hint && <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{props.hint}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="danger" onClick={props.onConfirm}>{props.confirmLabel}</button>
        <button onClick={() => setArmed(false)}>{props.cancelLabel ?? 'Cancel'}</button>
      </div>
    </div>
  );
}
