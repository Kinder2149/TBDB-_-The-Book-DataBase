/*
 * notify.js — canal d'erreurs UNIQUE de l'application (§7, garde-fou 4).
 * Toute erreur remonte ici, traduite en français, et s'efface seule.
 * Piège évité : le projet séries a une seule variable `error` globale jamais
 * effacée, et des `.catch(() => {})` muets ailleurs — donc soit un message
 * technique brut affiché, soit un échec totalement silencieux. Pas de milieu.
 * Ce module n'a aucune dépendance : il est importable de n'importe quelle couche.
 */

let abonnes = [];
let sequence = 0;

/** Fait apparaître un message. Le seul moyen d'informer l'utilisateur. */
export function notify(message, ton = 'erreur') {
  if (!message) return;
  sequence += 1;
  const item = { id: sequence, message: String(message), ton };
  abonnes.forEach((fn) => fn(item));
}

/** Utilisé par Toast.jsx. Rend la fonction de désabonnement. */
export function onNotify(fn) {
  abonnes.push(fn);
  return () => { abonnes = abonnes.filter((f) => f !== fn); };
}
