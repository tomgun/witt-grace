import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { setNumberLanguage } from './numberFormat.ts';
import { getStore } from './store.ts';
import './styles.css';
import './themes-added.css';

// Figures follow the language (numberFormat.ts). Subscribed before React is, so a language change restyles the
// figures in the same render that changes the words.
const store = getStore();
setNumberLanguage(store.get().language);
store.subscribe(() => setNumberLanguage(store.get().language));

const mount = document.getElementById('app');
if (!mount) throw new Error('WITT: the #app element is missing from index.html');
createRoot(mount).render(
  <StrictMode>
    <App />
  </StrictMode>
);
