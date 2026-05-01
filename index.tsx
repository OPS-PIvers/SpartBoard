import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import { attemptChunkReload } from './utils/chunkLoadError';

// Vite v5+ fires `vite:preloadError` when a <link rel="modulepreload"> fails —
// usually because the chunk no longer exists after a redeploy. Calling
// preventDefault() lets Vite fall back to a normal import; combined with the
// one-shot reload below, the page self-heals to the new build.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  attemptChunkReload();
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
