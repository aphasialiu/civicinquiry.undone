import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';
import { startPerfProbe } from './perfProbe';
import { readEmbedded } from './embedded';

startPerfProbe();

// 離線閱讀（PWA）是可選功能：以 VITE_PWA=true 建置才註冊 Service Worker。
if (import.meta.env.VITE_PWA === 'true' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App embedded={readEmbedded()} />
  </StrictMode>,
);
