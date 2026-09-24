import { SessionPanel } from '@/src/ui/SessionPanel';
import { minutes } from '@/src/ui/format';
import { useStorageItem } from '@/src/ui/hooks';
import { creditItem } from '@/src/storage/state';

export default function App() {
  const credit = useStorageItem(creditItem);
  const openDashboard = () =>
    browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });

  return (
    <main style={{ width: 280, padding: 16, display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Focus</h1>
        <span className="muted">{credit ? minutes(credit.balanceSeconds) : '–'} credit</span>
      </header>
      <SessionPanel />
      <footer style={{ display: 'flex', gap: 8 }}>
        <button onClick={openDashboard}>Dashboard</button>
        <button onClick={() => browser.runtime.openOptionsPage()}>Settings</button>
      </footer>
    </main>
  );
}
