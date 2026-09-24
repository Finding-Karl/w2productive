import { useCallback, useEffect, useState } from 'react';
import { LeaderboardsView, type Board } from '@/src/ui/dashboard/LeaderboardsView';
import { ProfileView } from '@/src/ui/dashboard/ProfileView';

/**
 * Hash routes:
 *   #profile               your profile (default)
 *   #profile/<userId>      someone you share a leaderboard with
 *   #leaderboards[/group|collective/<id>]
 */
type Route = { page: 'profile'; userId: string | null } | { page: 'leaderboards'; board: Board | null };

function parse(hash: string): Route {
  const [page, a, b] = hash.replace(/^#/, '').split('/');
  if (page === 'leaderboards') {
    return { page, board: (a === 'group' || a === 'collective') && b ? { kind: a, id: b } : null };
  }
  return { page: 'profile', userId: page === 'profile' && a ? a : null };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (hash: string) => {
    location.hash = hash;
  };
  const onBoard = useCallback((b: Board) => {
    history.replaceState(null, '', `#leaderboards/${b.kind}/${b.id}`);
    setRoute({ page: 'leaderboards', board: b });
  }, []);

  return (
    <main style={{ maxWidth: 960, margin: '40px auto', padding: '0 16px', display: 'grid', gap: 24 }}>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Dashboard</h1>
        <nav className="tabs" role="tablist" style={{ border: 0 }}>
          <button role="tab" aria-selected={route.page === 'profile' && !route.userId} onClick={() => go('profile')}>My profile</button>
          <button role="tab" aria-selected={route.page === 'leaderboards'} onClick={() => go('leaderboards')}>Leaderboards</button>
        </nav>
      </header>
      {route.page === 'profile' && (
        <>
          {route.userId && (
            <a className="link muted" href="#leaderboards" onClick={(e) => { e.preventDefault(); history.back(); }} style={{ justifySelf: 'start', fontSize: 14 }}>
              ← Back
            </a>
          )}
          <ProfileView key={route.userId ?? 'me'} userId={route.userId} />
        </>
      )}
      {route.page === 'leaderboards' && <LeaderboardsView board={route.board} onBoard={onBoard} />}
    </main>
  );
}
