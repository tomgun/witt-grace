import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

const mount = document.getElementById('app');
if (!mount) throw new Error('WITT: the #app element is missing from index.html');
createRoot(mount).render(
  <StrictMode>
    <App />
  </StrictMode>
);
