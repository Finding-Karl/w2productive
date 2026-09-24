export default function App() {
  const open = (path: '/dashboard.html' | '/blocked.html') =>
    browser.tabs.create({ url: browser.runtime.getURL(path) });

  return (
    <main style={{ width: 280, padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Focus</h1>
      <p style={{ margin: 0, color: 'var(--muted)' }}>Scaffold — sessions coming next.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="primary" onClick={() => open('/dashboard.html')}>Dashboard</button>
        <button onClick={() => browser.runtime.openOptionsPage()}>Settings</button>
        <button onClick={() => open('/blocked.html')}>Block page</button>
      </div>
    </main>
  );
}
