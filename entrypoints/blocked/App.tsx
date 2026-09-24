import { SessionPanel } from '@/src/ui/SessionPanel';
import { useStorageItem } from '@/src/ui/hooks';
import { activeSessionItem } from '@/src/storage/state';

/** The original URL is passed in the hash by the DNR redirect rule (or redirectOpenTabs). */
const originalUrl = location.hash.slice(1) || null;
const originalHost = (() => {
  try {
    return originalUrl ? new URL(originalUrl).hostname : null;
  } catch {
    return null;
  }
})();

export default function App() {
  const session = useStorageItem(activeSessionItem);
  if (session === undefined) return null;

  return (
    <main style={{ maxWidth: 480, margin: '15vh auto', padding: '0 16px', display: 'grid', gap: 24 }}>
      <div>
        <h1 style={{ margin: '0 0 8px' }}>{originalHost ?? 'This site'} {session ? 'is' : 'was'} blocked</h1>
        <p className="muted" style={{ margin: 0 }}>
          {session
            ? 'You’re in a focus session. Close this tab and get back to it.'
            : 'No focus session is running, so this site is available again.'}
        </p>
      </div>

      {session ? (
        <SessionPanel stopLabel="Give up session" />
      ) : (
        originalUrl && (
          <a href={originalUrl} style={{ color: 'var(--accent)' }}>
            Continue to {originalHost}
          </a>
        )
      )}
    </main>
  );
}
