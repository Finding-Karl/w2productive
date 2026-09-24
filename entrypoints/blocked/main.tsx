import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/src/ui/base.css';
import { send } from '@/src/messages';
import App from './App';

// Count the hit once per page load (outside React so StrictMode's double effects can't double it).
// It's a stat only — hitting the block page doesn't break the session.
void send({ type: 'session/blockHit' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
