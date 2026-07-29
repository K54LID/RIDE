import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Telegram expects the app to signal readiness before it reveals the
// webview; skipping this leaves users on a blank frame.
window.Telegram?.WebApp?.ready();
window.Telegram?.WebApp?.expand();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
