// Must stay first: a view-as tab swaps out browser storage before any module reads it.
import './utils/viewAsTab';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { i18nReady } from './i18n';
import { attemptChunkReload } from './utils/chunkLoadError';
import { installTranslateDomGuard } from './utils/translateDomGuard';
import { LocalProdBanner } from './components/common/LocalProdBanner';

// Vite v5+ fires `vite:preloadError` when a <link rel="modulepreload"> fails —
// usually because the chunk no longer exists after a redeploy. Calling
// preventDefault() lets Vite fall back to a normal import; combined with the
// one-shot reload below, the page self-heals to the new build.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  attemptChunkReload();
});

installTranslateDomGuard();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element');

const root = ReactDOM.createRoot(rootElement);
const isLocalProd =
  import.meta.env.DEV &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID === 'spartboard';

// Wait for the saved language so non-English users never see a flash of English.
void i18nReady
  .catch(() => undefined)
  .then(() => {
    root.render(
      <React.StrictMode>
        {isLocalProd && <LocalProdBanner />}
        <App />
      </React.StrictMode>
    );
  });
