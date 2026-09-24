import { AccountPanel } from '@/src/ui/AccountPanel';

export default function App() {
  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 16px', display: 'grid', gap: 32 }}>
      <h1 style={{ margin: 0 }}>Settings</h1>
      <section style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Account &amp; sync</h2>
        <AccountPanel />
      </section>
      <section>
        <h2 style={{ margin: 0, fontSize: 18 }}>Blocking &amp; credits</h2>
        <p className="muted">Enforcement mode, list mode, lists, earn ratio, vault — coming soon.</p>
      </section>
    </main>
  );
}
