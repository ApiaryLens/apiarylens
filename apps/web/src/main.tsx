import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const serviceWorkerPath = window.location.pathname.startsWith('/app/')
      ? '/app/sw.js'
      : '/sw.js';
    void navigator.serviceWorker.register(serviceWorkerPath).then((registration) => {
      const announce = () =>
        window.dispatchEvent(new CustomEvent('apiarylens:update-ready', { detail: registration }));
      if (registration.waiting) announce();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) announce();
        });
      });
    });
  });
}

const root = document.querySelector('#root');
if (!root) throw new Error('Application root is missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
