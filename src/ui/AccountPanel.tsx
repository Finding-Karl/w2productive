import { useState } from 'react';
import { signInWithGoogle, signOut } from '@/src/lib/auth';
import { isBackendConfigured } from '@/src/lib/supabase';
import { send } from '@/src/messages';
import { syncStateItem } from '@/src/storage/state';
import { useStorageItem } from './hooks';
import { ago } from './relativeTime';
import { useAuthUser } from './useAuthUser';

export function AccountPanel() {
  const user = useAuthUser();
  const sync = useStorageItem(syncStateItem);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };
  const syncNow = async () => {
    const reply = await send({ type: 'sync/now' });
    if (!reply.ok) throw new Error(reply.error);
  };

  if (!isBackendConfigured) {
    return (
      <p className="muted">
        Sync isn’t configured for this build. Add Supabase keys to <code>.env</code> (see
        docs/supabase-setup.md). Everything still works locally.
      </p>
    );
  }
  if (user === undefined || !sync) return null;

  if (!user) {
    return (
      <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <p className="muted" style={{ margin: 0 }}>
          Sign in to back up your credits and sessions and sync them across browsers.
        </p>
        <button className="primary" disabled={busy} onClick={() => act(() => signInWithGoogle().then(syncNow))}>
          Sign in with Google
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const pending = sync.pendingEventIds.length + sync.pendingSessionIds.length;
  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
      <p style={{ margin: 0 }}>
        Signed in as <strong>{user.email}</strong>
      </p>
      <p className="muted" style={{ margin: 0 }}>
        {sync.lastSyncedAt ? `Last synced ${ago(sync.lastSyncedAt)}` : 'Not synced yet'}
        {pending > 0 && ` · ${pending} change${pending === 1 ? '' : 's'} waiting to upload`}
      </p>
      {sync.lastError && <p className="error">Last sync failed: {sync.lastError}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={busy} onClick={() => act(syncNow)}>Sync now</button>
        <button disabled={busy} onClick={() => act(signOut)}>Sign out</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
