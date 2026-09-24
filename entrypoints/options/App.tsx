import { useEffect, useState } from 'react';
import { AccountPanel } from '@/src/ui/AccountPanel';
import { BlockingTab } from '@/src/ui/BlockingTab';
import { GroupsTab } from '@/src/ui/GroupsTab';

const TABS = { blocking: 'Blocking', groups: 'Groups', account: 'Account' } as const;
type Tab = keyof typeof TABS;

function initialTab(): Tab {
  const h = location.hash.slice(1);
  return h in TABS ? (h as Tab) : 'blocking';
}

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => {
    const onHash = () => setTab(initialTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const select = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };

  return (
    <main style={{ maxWidth: 760, margin: '48px auto', padding: '0 16px', display: 'grid', gap: 24 }}>
      <h1 style={{ margin: 0 }}>Settings</h1>
      <nav className="tabs" role="tablist">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => select(t)}>
            {TABS[t]}
          </button>
        ))}
      </nav>
      {tab === 'blocking' && <BlockingTab />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'account' && <AccountPanel />}
    </main>
  );
}
