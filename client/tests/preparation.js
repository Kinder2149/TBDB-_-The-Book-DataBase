/*
 * Preparation commune a toutes les verifications.
 *
 * Node n'est pas un navigateur : il lui manque quelques objets que
 * l'application utilise. On ne les SIMULE que quand ils sont de simples
 * boites de rangement, jamais quand ils portent une regle metier — sinon on
 * ne verifierait plus que nos propres imitations.
 */

// Le profil actif est memorise ici (api.js). Une Map suffit : le comportement
// de localStorage qui nous interesse tient en « je range » / « je relis ».
if (typeof globalThis.localStorage === 'undefined') {
  const memoire = new Map();
  globalThis.localStorage = {
    getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
    setItem: (k, v) => { memoire.set(k, String(v)); },
    removeItem: (k) => { memoire.delete(k); },
    clear: () => { memoire.clear(); },
    key: (i) => [...memoire.keys()][i] ?? null,
    get length() { return memoire.size; },
  };
}

// Utilise par la lecture d'une image de couverture. Aucune verification ne
// fabrique d'image, mais le module doit pouvoir se charger.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ style: {}, addEventListener() {}, click() {}, getContext: () => ({}) }),
    body: { appendChild() {}, removeChild() {} },
  };
}
