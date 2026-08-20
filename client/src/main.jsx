/*
 * main.jsx — bootstrap. Pose le thème sur <html> AVANT le premier rendu React.
 * Décision héritée (§9) : fait après, on voit un flash de thème clair au
 * démarrage sur fond sombre. Trois états couverts : choix explicite mémorisé,
 * préférence système, défaut.
 * Enveloppe l'application dans ErrorBoundary (§7) : sans lui, une erreur de
 * rendu donne un écran blanc sans issue, comme sur le projet séries.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

const choisi = localStorage.getItem('theme');
const systeme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.theme = choisi || systeme;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Service worker : uniquement pour l'installabilité PWA, jamais pour du cache.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sans effet sur l'app */ });
  });
}
