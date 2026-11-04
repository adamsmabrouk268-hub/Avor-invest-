import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register Service Worker immediately so browser recognizes standalone PWA installability
registerSW({
  immediate: true,
  onRegisterError(error) {
    console.warn('PWA service worker registration warning:', error);
  },
});

// Capture beforeinstallprompt early at window level so any button/modal can trigger native installation
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    (window as any).__avorDeferredPWAEvent = e;
    window.dispatchEvent(new Event('avor-pwa-installable'));
  });
  window.addEventListener('appinstalled', () => {
    (window as any).__avorDeferredPWAEvent = null;
    window.dispatchEvent(new Event('avor-pwa-installed'));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

