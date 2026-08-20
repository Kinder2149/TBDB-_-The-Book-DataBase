/*
 * Toast.jsx — la sortie visible du canal notify() (§7, garde-fou 4).
 * Un message s'affiche, s'efface seul au bout de 5 secondes, et n'empêche
 * jamais d'utiliser l'écran derrière.
 * Exception assumée à §2 règle 1 : ce composant importe notify.js. C'est le
 * rendu du canal d'erreurs, pas une donnée métier — au même titre que l'écran
 * de sauvegarde importe backup.js.
 * Piège évité : le projet séries n'efface jamais son message d'erreur.
 */

import { useEffect, useState } from 'react';
import { onNotify } from '../notify.js';

const DUREE_MS = 5000;

export default function Toast() {
  const [messages, setMessages] = useState([]);

  useEffect(() => onNotify((item) => {
    setMessages((actuels) => [...actuels, item]);
    setTimeout(() => {
      setMessages((actuels) => actuels.filter((m) => m.id !== item.id));
    }, DUREE_MS);
  }), []);

  if (messages.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`toast toast--${m.ton}`}>{m.message}</div>
      ))}
    </div>
  );
}
